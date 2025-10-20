import { effect, html, signal, render } from './uhtml.js';
import StateMachine from './fsm.js';
import StorageProxy from './storage.js';

// shorter keys than crypto.randomUUID()
const random = () => window.crypto.getRandomValues(new Uint32Array(1))[0];

// Define default state
// TODO: versioning, migration
const defaultState = {
	layout: 'grid',	/* list, manual */
  sort: 'last-modified', /* last-modified, title, created */
  order: 'desc', /* asc, desc */
  filter: '', /* search string */
  tags: [], /* array of tags */
  items: []
};

// Set up storage
const appKey = 'rfsm-grid';
const reset = false;
const debug = false;
const storagingState = await StorageProxy(appKey, defaultState, reset, debug);

// Set up signals
const appState = {};
for (let k in defaultState) {
  appState[k] =  signal(storagingState[k]);
};

// Debounced storage updater
// TODO: should be generalized
const updateStorage = () => { 
  for (let i in defaultState) {
    const stored = storagingState[i];
    const live = appState[i].value;
    if (Object.is(live, stored) === false) {
      storagingState[i] = appState[i].value;
      //console.log(`Updating storage key ${i} with value`, appState[i].value);
    }
  }
};
//const updateStorageDebounced = debounce(updateStorage, 1000);

// Component container
const appContainer = document.getElementById('app');

// State machine for application flow
const appFSM = new StateMachine({
  initial: 'uninitialized',
  states: {
    uninitialized: ['initialized'],
    initialized: ['viewing'],
    viewing: ['viewing'],
  }
});

/*
// Drives storage writes
appFSM.on('*', (prev) => {
  console.log(`FSM.on(*): state changed from ${prev} to ${appFSM.current}, (${appState.current.value})`);
  //updateStorage();
});
*/

appFSM.on('initialized', (prev) => {
  console.log('FSM.initialized: rendering');
  render(appContainer, html`<${App} />`);
  console.log('FSM.initialized: rendering started, setting state to viewing');
  appState.current.value = 'viewing';
});

appFSM.on('viewing', (prev) => {
  console.log('FSM.viewing');
});

// Item factory
const createItem = (text) => ({
  id: random(),
  text: text.trim(),
  tags: [],
  created: new Date(),
  modified: new Date()
});

// Actions - pure functions that modify state
const actions = {
  addItem: async ({text}) => {
    if (text.trim()) {
      const newItem = createItem(text);
      appState.items.value = [...appState.items.value, newItem];
      console.log('updateItem(): setting state to viewing');
      appState.current.value = 'viewing';
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
      //appState.items.value = appState.items.value.map(t => t.id === item.id ? { ...t, ...item } : t);
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
    appState.current.value = 'viewing';
  }
};

// Receive events from components
// and map them to actions

const emit = async (name, data) => {
  console.log('emit', name, data);
  window.dispatchEvent(new CustomEvent(name, { detail: data }));
  console.log('emit complete');
};

const eventStreamHandler = async (e) => {
  console.log('stream event:', e);
  const { name, props } = e.detail;
  if (name != null) {
    console.log('EventStream: invoking action:', name, props);
    await actions[name](props);
  }
  else {
    console.error('Unknown event, no matching action:', e.name);
  }
};
window.addEventListener('stream', eventStreamHandler);


// Detects state changes and triggers FSM transitions
// TODO: should not have actions setting state directly
// - make an action which trigger FSM?
// - or action calls fsm.go(), and a listener updates signal val?
const stateConductor = (stateMachine, currentStateSignal) => {
  effect(() => {
    console.log(`StateConductor() effect prev: ${stateMachine.current}, next: ${currentStateSignal.value}`);
    if (stateMachine.current != currentStateSignal.value) {
      //console.log('StateConductor: changing state to:', currentStateSignal.value);
      stateMachine.go(currentStateSignal.value).then(() => {
        console.log(`StateConductor() transition from ${stateMachine.current} to ${currentStateSignal.value} is complete`);
      });
    }
    //console.log('State changed to:', currentStateSignal.value);
  }, [currentStateSignal.value]);
};

// Components - pure UI functions
const StateInfo = ({ currentState, filter, items }) => {
  // State metadata
  const total = items.length;

  return html`
    <div class="state-info">
      <strong>State:</strong> ${currentState} |
      <strong>Filter:</strong> ${filter} |
      <strong>Items:</strong> ${total} total
    </div>
  `;
};

const Textarea = ({value}) => {
  const txt = signal(value);

  const oninput = (e) => {
    //console.log(`textarea.oninput(): ${txt.value} -> ${e.target.value}`);
  };

  return html`
    <textarea oninput=${oninput}>
      ${txt.value}
    </textarea>
  `;
};

const Card = ({item}) => {
  //console.log('Card', item);
  const txt = signal(item.text);

  const onInput = async e => {
    const newVal = e.target.value;
    console.log('card.onInput:', newVal);
    //txt.value = newVal;
    item.text = newVal;
    console.log('card.onInput: set');
    await emit('stream', { name: 'updateItem', props: { item }});
    console.log('card.onInput: done');
  };

  return html`
    <div @input=${onInput}>
      <${Textarea} value=${txt.value}/>
    </div>
  `;
};

const Cards = ({items}) => {
  console.log('Cards', items);
  return html`
    <div>
      ${items.map(item => Card({item}))}
    </div>
  `;
};

const App = () => {
  console.log('App', appState);
  const counter = signal(0);
  return html`
    <div class="item-app">
      <h1>FSM+uHTML Grid (${counter.value++})</h1>
      <${StateInfo}
        currentState=${appState.current.value}
        items=${appState.items.value}
      />
      <${Cards}
        items=${appState.items.value}
      />
    </div>
  `;
};

// Initialize signal for current FSM state
appState.current = signal(appFSM.current);

/*
// Update storage on changes to state
effect(() => {
  console.log('effect() Appstate.current effect:', appState.current.value);
  updateStorage();
}, [appState.current.value]);
*/

// Example data
if (appState.items.value.length == 0) {
  console.log('ADDING EXAMPLES because no items exist');
  // is there a savings in doing this before initializing the fsm?
  // maybe just confusing
  //[...Array(3)].map((_, i) => actions.addItem(`item ${i}`));
  const itemCount = 1;
  appState.items.value  = [...Array(itemCount)].map((_, i) => createItem(`item ${i}`));
  console.log('Initial items:', appState.items.value);
}

// Initialized effect that syncs the signal to the state machine
stateConductor(appFSM, appState.current);

// Fire up the machine
appState.current.value = 'initialized';

