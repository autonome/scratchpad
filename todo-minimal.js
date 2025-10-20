import { effect, html, signal, render } from './uhtml.js';
import StateMachine from './fsm.js';
import StorageProxy from './storage.js';

// shorter keys than crypto.randomUUID()
const random = () => window.crypto.getRandomValues(new Uint32Array(1))[0];

// Josh Comeau version
const debounce = (callback, wait) => {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback.apply(null, args);
    }, wait);
  };
}

// Default state
const defaultState = {
  current: 'uninitialized',
  todos: [],
  filter: 'all'
};

const appKey = 'todo-rfsm';

const reset = false;
const storagingState = await StorageProxy(appKey, defaultState, reset);
//console.log('stored:', storagingState.todos);

// Reset each page load
const appState = {
  // Don't persist current state, as it's per page load.
  // Maybe could do some app persistence here.
  current: signal(defaultState.current),
  todos: signal(storagingState.todos),
  filter: signal(storagingState.filter)
};

// Debounced storage updater
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
const updateStorageDebounced = debounce(updateStorage, 1000);

// Update storage on changes to state
effect(() => {
  //console.log('storage effect, state:', appState.current.value);
  updateStorage();
}, [appState.current.value, appState.filter.value, appState.todos.value]);

// Component container
const appContainer = document.getElementById('app');

// Todo factory
const createTodo = (text) => ({
  id: random(),
  text: text.trim(),
  completed: false,
  created: new Date(),
  modified: new Date()
});

// Actions - pure functions that modify state
const actions = {
  addTodo: ({text}) => {
    if (text.trim()) {
      const newTodo = createTodo(text);
      appState.todos.value = [...appState.todos.value, newTodo];
      appState.current.value = 'viewing';
    }
  },

  updateTodo: ({todo}) => {
    if (todo.deleted) {
      appState.todos.value = appState.todos.value.filter(t => t.id != todo.id);
      console.log('deleted');
    }
    else {
      appState.todos.value = appState.todos.value.map(t => t.id === todo.id ? { ...t, ...todo } : t);
    }
    appState.current.value = 'viewing';
  },

  setFilter: (filter) => {
    console.log('Setting filter to:', filter);
    //appState.filter.value = filter;
  }
};

// State machine for application flow
const appFSM = new StateMachine({
  initial: 'uninitialized',
  states: {
    uninitialized: ['initialized'],
    initialized: ['viewing'],
    viewing: ['adding', 'filtering', 'viewing'],
    adding: ['viewing'],
    filtering: ['viewing']
  }
});

appFSM.on('*', async (prev) => {
  console.log(`FSM.on(*): state changed from ${prev} to ${appFSM.current}`);
  appState.current.value = appFSM.current;
});

appFSM.on('initialized', async () => {
  render(appContainer, html`<${App} />`);
  //console.log('FSM.initialized, setting state to viewing');
  appState.current.value = 'viewing';
});

appFSM.on('viewing', async (prev) => {
  //console.log('FSM.viewing:', prev);
});

appFSM.on('filtering', async (prev, filter) => {
  actions.setFilter(filter);
  //await appFSM.go('viewing', filter);
});

// Receive events from components
// and maps them to actions
const eventStreamHandler = (e) => {
  //console.log('EventStream:', e.name, e.props);
  if (e.name in actions) {
    console.log('EventStream: invoking action:', e.name, e.props);
    actions[e.name](e.props);
  }
  else {
    console.error('Unknown event, no matching action:', e.name);
  }
};

// Detects state changes and triggers FSM transitions
// TODO: should not have actions setting state directly
// - make an action which trigger FSM?
// - or action calls fsm.go(), and a listener updates signal val?
const stateConductor = (stateMachine, currentStateSignal) => {
  effect(() => {
    //console.log('StateConductor: effect - current state signal changed to:', currentStateSignal.value);
    if (stateMachine.current != currentStateSignal.value) {
      //console.log('StateConductor: changing state to:', currentStateSignal.value);
      stateMachine.go(currentStateSignal.value);
    }
    //console.log('State changed to:', currentStateSignal.value);
  }, [currentStateSignal.value]);
};

// Components - pure UI functions
const TodoInput = () => {
  const textSignal = signal('');

  /*
  effect(async () => {
    console.log('TodoInput effect - text changed:', textSignal.value);
    if (textSignal.value.trim()) {
      console.log('TodoInput effect - Adding todo:', textSignal.value);
      eventStreamHandler({ name: 'addTodo', props: { text: textSignal.value }});
      textSignal.value = '';
    }
  }, [textSignal.value]);
  */

  const handleKeyPress = async (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      textSignal.value = e.target.value;
      eventStreamHandler({ name: 'addTodo', props: { text: textSignal.value }});
    }
  };

  return html`
    <div class="input-section">
      <input
        type="text"
        class="todo-input"
        placeholder="What needs to be done?"
        value=${textSignal.value}
        onkeypress=${handleKeyPress}
      />
    </div>
  `;
};

const FilterButton = ({ filter, label, active }) => {

  const sFilter = signal(filter);

  const onclick = async () => {
    sFilter.value = filter;
    //await appFSM.go('filtering', filter);
    //eventStreamHandler({ name: 'setFilter', props: { filter: sFilter.value }});
  };

  return html`<button class="${active ? 'active' : 'not'}"
    onclick=${onclick} >${label}</button>`;
};

const FilterControls = ({ filter, onFilterChange, fsm }) => {
  const filters = { all: 'All', active: 'Active', completed: 'Completed' };
  return html`
    <div class="controls">
      ${Object.entries(filters).map(([k, v]) =>
        html`<${FilterButton} filter="${k}" label="${v}" active=${filter == k} />`
      )}
    </div>
  `;
};

const TodoItem = ({ todo }) => {
  //console.log('Rendering TodoItem:', todo);

  // kinda wonky
  todo.deleted = false;
  
  /*
  // broken
  //const sTodo = signal(todo);

  // effects don't fire
  effect(() => {
    console.log('TodoItem effect - todo changed (old/new):', todo, sTodo.value);
    //eventStreamHandler({ name: 'updateTodo', props: { todo }});
  }, [sTodo.value.completed, sTodo.value.deleted]);
  */

  const onToggle = (e) => {
    todo.completed = e.target.checked;
    eventStreamHandler({ name: 'updateTodo', props: { todo }});
  };

  const onDelete = () => {
    todo.deleted = true;
    eventStreamHandler({ name: 'updateTodo', props: { todo }});
  };

  return html`
    <li class=${'todo-item' + (todo.completed === true ? ' completed' : '')}>
      <input
        type="checkbox"
        defaultChecked=${todo.completed? 'true' : 'false'}
        onchange=${onToggle}
      />
      <span class="todo-text">${todo.text}</span>
      <button
        class="delete-btn"
        onclick=${onDelete}
      >Delete</button>
    </li>
  `;
};

const TodoList = ({ todos, filter }) => {
  console.log('Rendering TodoList with todos:', todos.value);

  if (todos.value.length === 0) {
    const message = filter.value === 'all'
      ? 'No todos yet. Add one above!'
      : `No ${filter.value} todos.`;

    return html`<div class="empty-state">${message}</div>`;
  }

  const ff = (todo) => {
    return filter == 'all'
      || filter == 'completed' && todo.completed
      || filter == 'active' && !todo.completed;
  };

  return html`
    <ul class="todo-list">
      ${todos.value.filter(ff).map(todo => TodoItem({todo}))}
    </ul>
  `;
};

const StateInfo = ({ appState, filter, todos }) => {
  // State metadata
  const total = todos.value.length;
  const completed = todos.value.filter(t => t.completed).length;
  const active = total - completed;

  return html`
    <div class="state-info">
      <strong>App:</strong> ${appState} |
      <strong>Filter:</strong> ${filter} |
      <strong>Todos:</strong> ${total} total, ${active} active, ${completed} completed
    </div>
  `;
};

const App = (count) => {
  const counter = signal(count || 0);
  return html`
    <div class="todo-app">
      <h1>FSM + uhtml Todo List (${counter.value}</h1>
      <${StateInfo}
        appState=${appState.current}
        filter=${appState.filter}
        todos=${appState.todos}
      />
      <${TodoInput}
        inputText=${appState.inputText}
      />
      <${FilterControls}
        filter=${appState.filter}
      />
      <${TodoList}
        todos=${appState.todos}
        filter=${appState.filter}
      />
    </div>
  `;
};


// Initialize
console.log('main: initializing stateConductor');
await stateConductor(appFSM, appState.current);
console.log('main: initialized stateConductor');
appState.current.value = 'initialized';
console.log('main: set current state to initialized');

if (appState.todos.value.length == 0) {
  console.log('ADDING EXAMPLES because no todos exist');
  // is there a savings in doing this before initializing the fsm?
  // maybe just confusing
  //[...Array(3)].map((_, i) => actions.addTodo(`todo ${i}`));
  appState.todos.value  = [...Array(3)].map((_, i) => createTodo(`todo ${i}`));
  console.log('Initial todos:', appState.todos.value);
}


