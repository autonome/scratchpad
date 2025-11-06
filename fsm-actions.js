import StateMachine from './fsm.js';
import StorageProxy from './storage.js';
import StreamMapper from './streammapper.js';
import debounce from './debounce.js';
import { effect, html, signal, render } from './reactive.js';

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

// Maximum write interval
const writeInterval = 5000;

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
const updateStorageImmediately = () => {
  console.log('updateStorage()');
  for (let i in defaultState) {
    storagingState[i] = appState[i].value;
  }
};

const updateStorage = debounce(updateStorageImmediately, writeInterval);

// Component container
const appContainer = document.querySelector('#app');

// State machine for application flow
const machineConfig = {
  initial: 'uninitialized',
  states: {
    uninitialized: ['initialized'],
    initialized: ['viewlist'],
    viewlist: ['editing'],
    editing: ['viewlist']
  }
};

const machine = new StateMachine(machineConfig);

// Initialize signal tracking machine current state
appState.current = signal(machine.current);

machine.on('*', (prev) => {
  //console.log(`FSM.on(*): state changed from ${prev} to ${machine.current}, (${appState.current.value})`);
  console.log('FSM.on(*): ', prev, 'to', machine.current);

  // Sync signal to state machine current state
  appState.current.value = machine.current;

  console.log('Effect: state changed to', machine.current);
  // Don't bother writing until after initialization
  if (!['uninitialized', 'initialized'].includes(machine.current)) {
    console.log('effect: calling updateStorage()');
    updateStorage();
  }
});

machine.on('initialized', async (prev) => {
  console.log('FSM.initialized');

  // Increment counter once per page load
  appState.counter.value = appState.counter.value + 1;

  machine.go();
});

machine.on('viewlist', (prev) => {
  console.log('FSM.viewlist');

  // Watch for item changes and re-render
  // This effect runs immediately, handling the initial render
  effect(() => {
    const items = appState.items.value; // Subscribe to items
    console.log('Rendering app with', items.length, 'items');
    render(appContainer, html`${App(appState)}`);
  });
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
      console.log('addItem()');
      const newItem = createItem(text);
      appState.items.value = [...appState.items.value, newItem];
      console.log('addItem(): done');
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
    console.log('updateItem(): done');
  },

  deleteItem: async ({item}) => {
    console.log('actions.deleteItem', item);
    appState.items.value = appState.items.value.filter(t => t.id != item.id);
    console.log('deletedItem()');
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
    <div data-key="${item.id}" oninput=${onInput}>
      ${Textarea({value: s.value.text})}
      ${Button({label: 'Delete', onclick: onDelete})}
    </div>
  `;
};

const Cards = ({ items }) => {
  const s = signal(items);

  return html`
    <div>
      ${s.value.map(item => Card({item}))}
    </div>
  `;
};

const App = (state) => {
  console.log('App', state);

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
      ${StateInfo({currentState: machine.current, items: state.items.value})}
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

// Fire up the machine
await machine.go();

window.addEventListener('beforeunload', (e) => {
  console.log('beforeunload: flushing storage');
  updateStorageImmediately();
});

console.log('main complete');

