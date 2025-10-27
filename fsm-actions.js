import StateMachine from './fsm.js';
import StorageProxy from './storage.js';
import StreamMapper from './streammapper.js';
import { effect, html, signal } from './reactive.js';

// shorter keys than crypto.randomUUID()
const random = () => window.crypto.getRandomValues(new Uint32Array(1))[0];

// Define default state
// TODO: versioning, migration
const defaultState = {
  counter: 0,
	layout: 'grid',	/* list, manual */
  sort: 'last-modified', /* last-modified, title, created */
  order: 'desc', /* asc, desc */
  filter: '', /* search string */
  tags: [], /* array of tags */
  items: []
};

const DEBUG = false;

// Use a unique key for app storage
const appKey = 'rfsm-actions';
const clearStorage = false;

// Initialize storage proxy
const storagingState = await StorageProxy(appKey, defaultState, clearStorage, DEBUG);

// Set up signals
const appState = {};
for (const k in defaultState) {
  appState[k] =  signal(storagingState[k]);
};

// Debounced storage updater
// TODO: should be generalized
const updateStorage = () => { 
  for (let i in defaultState) {
    const stored = storagingState[i];
    const live = appState[i];
    if (Object.is(live, stored) === false) {
      storagingState[i] = appState[i].value;
      //console.log(`Updating storage key ${i} with value`, appState[i]);
    }
  }
};
//const updateStorageDebounced = debounce(updateStorage, 1000);

// Component container
const appContainer = document.querySelector('#app');

// State machine for application flow
const machineConfig = {
  initial: 'uninitialized',
  states: {
    uninitialized: ['initialized'],
    initialized: ['viewing'],
    viewing: ['editing'],
    editing: ['viewing']
  }
};

const machine = new StateMachine(machineConfig);

/*
machine.on('*', (prev) => {
  //console.log(`FSM.on(*): state changed from ${prev} to ${machine.current}, (${appState.current.value})`);
  console.log('FSM.on(*): ', prev, 'to', machine.current);
  if (prev !== machine.current) {
    console.log('FSM.on(*): changing state', prev, 'to', machine.current);
    //appState.current.value = machine.current;
  }
});
*/

machine.on('initialized', async (prev) => {
  console.log('FSM.initialized: rendering');
  appContainer.innerHTML = html`${App(appState)}`;
  console.log('FSM.initialized: rendering started, setting state to viewing');
  //appState.current.value = 'viewing';
  appState.current.value = machine.current;
  machine.go();
});

machine.on('viewing', (prev) => {
  console.log('FSM.viewing');
  appContainer.innerHTML = html`${App(appState)}`;
});

// Item factory
const createItem = (text) => ({
  id: random(),
  text: text.trim(),
  tags: [],
  created: new Date(),
  modified: new Date()
});

/*
 * Actions - pure functions that modify state
 *
 */
const actions = {
  addItem: async ({text}) => {
    if (text.trim()) {
      const newItem = createItem(text);
      appState.items.value = [...appState.items.value, newItem];
      console.log('updateItem(): setting state to viewing');
      //appState.current.value = 'viewing';
    }
  },

  updateItem: async ({item}) => {
    console.log('actions.updateItem', item);
    if ('deleted' in item) {
      appState.items.value = appState.items.value.filter(t => t.id != item.id);
      console.log('deleted');
    }
    else {
      console.log('updating...');
      //item.lastModified = new Date();
      //appState.items= appState.items.map(t => t.id === item.id ? { ...t, ...item } : t);
      const newItems = appState.items.value.map(t => t.id === item.id ? { ...t, ...item } : t);
      console.log('newItems', newItems);
      try {
        appState.items.value = newItems;
      } catch(ex) {
        console.error('update failed', ex);
      }
      console.log('new items', newItems);
    }
    console.log('updateItem(): setting state to viewing');
    //appState.current.value = 'viewing';
  },

  deleteItem: async ({item}) => {
    console.log('actions.deleteItem', item);
    appState.items.value = appState.items.value.filter(t => t.id != item.id);
    console.log('deletedItem(): setting state to viewing');
    //appState.current.value = 'viewing';
  }
};

// Initialize stream mapper - a function customized to the provided
// set of actions, and calls them when matching events are sent to it.

const listener = async () => { await machine.go() };

const emit = StreamMapper(actions, listener);

/*
 * Components - pure UI functions
 *
 */

const StateInfo = ({ currentState, items }) => {
  console.log('StateInfo', currentState, items);
  // State metadata
  const total = items.length;

  return `
    <div class="state-info">
      <strong>State:</strong> ${currentState} |
      <strong>Items:</strong> ${total} total
    </div>
  `;
};

const Textarea = ({ value }) => {
  const text = signal(value);

  const oninput = (e) => {
    text.value = e.target.value;
  };

  return html`
    <textarea oninput=${oninput}>${text.value}</textarea>
  `;
};

const Button = ({ label, onclick }) => {
  const s = signal(label);
  return html`<button onclick=${onclick}>${s.value}</button>`;
};

const Card = ({ item }) => {
  const s = signal(item);

  const onInput = async (e) => {
    s.value = item.text = e.target.value;
    emit('updateItem', { item });
  };

  const onDelete = async (e) => {
    emit('deleteItem', { item });
  };

  return html`
    <div oninput=${onInput}>
      ${Textarea({value: s.value.text})}
      ${Button({label: 'Delete', onclick: onDelete})}
    </div>
  `;
};

const Cards = ({items}) => {
  const s = signal(items);

  return html`
    <div>
      ${s.value.map(item => Card({item}))}
    </div>
  `;
};

const App = (state) => {
  console.log('App', state);
  state.counter.value = state.counter.value + 1;

  const onClickNew = () => emit('addItem', {text: 'New item'});

  const layout = signal(state.layout.value);
  const onClickLayout = () => console.log('Layout change');

  const sort = signal(state.sort.value);
  const onClickSort = () => console.log('Sort change');

  return html`
    <header>
      <h1>Reactive FSM Test</h1>
    </header>
    <div class="item-app">
      ${Button({label: '+', onclick: onClickNew})}
      ${Button({label: layout.value, onclick: onClickLayout})}
      ${Button({label: sort.value, onclick: onClickSort})}
      ${StateInfo({currentState: state.current.value, items: state.items.value})}
      ${Cards({items: state.items.value})}
    </div>
    <footer>
      <div>(You've been here ${state.counter.value} times.</div>
    </footer>
  `;
};

// Example data
if (appState.items.length == 0) {
  console.log('ADDING EXAMPLES because no items exist');
  // is there a savings in doing this before initializing the fsm?
  // maybe just confusing
  //[...Array(3)].map((_, i) => actions.addItem(`item ${i}`));
  const itemCount = 3;
  appState.items.value = [...Array(itemCount)].map((_, i) => createItem(`item ${i}`));
  console.log('Initial items:', appState.items);
}

// Initialized signal and effect that syncs the signal to the state machine
appState.current = signal(machine.current);

const delay = f => setTimeout(f, DEBUG ? 2000 : 0);

//
effect(async () => {
  // Writes
  // TODO: debounce
  updateStorage();
  const next = machineConfig.states[machine.current][0];
    console.log('Dirty flag, next state:', next);
//}, [appState.current.value]);
}, [appState.current.value]);

// Fire up the machine
await machine.go();

console.log('main complete');

