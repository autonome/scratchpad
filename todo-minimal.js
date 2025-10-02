import { effect, html, signal, render } from './uhtml.js';
import StateMachine from './fsm.js';

// Core state - single source of truth
const appState = {
  current: signal('uninitialized'),
  todos: signal([]),
  filter: signal('')
};

const appContainer = document.getElementById('app');

// Todo factory
const createTodo = (text) => ({
  id: Date.now(),
  text: text.trim(),
  completed: false,
  created: new Date()
});

// Receive events from components
// and translate them to actions
// and possibly FSM transitions
const eventStreamHandler = (e) => {
  console.log('EventStream:', e);
};

// Actions - pure functions that modify state
const actions = {
  addTodo: (text) => {
    if (text.trim()) {
      console.log('Action.addTodo:', text);
      const newTodo = createTodo(text);
      appState.todos.value = [...appState.todos.value, newTodo];
    }
  },

  deleteTodo: (id) => {
    console.log('Deleting todo with id:', id);
    appState.todos.value = appState.todos.value.filter(t => t.id !== id);
  },

  toggleTodo: (id) => {
    console.log('Toggling todo with id:', id);
    const todo = appState.todos.value.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
    appState.todos.value = appState.todos.value.map(t => t.id === id ? todo : t);
  },

  setFilter: (filter) => {
    console.log('Setting filter to:', filter);
    appState.filter.value = filter;
  }
};

// State machine for application flow
const appFSM = new StateMachine({
  initial: 'uninitialized',
  states: {
    uninitialized: ['initialized'],
    initialized: ['viewing'],
    viewing: ['adding', 'filtering'],
    adding: ['viewing'],
    filtering: ['viewing']
  }
});

appFSM.on('*', async (prev) => {
  console.log(`FSM state changed from ${prev} to ${appFSM.current}`);
  appState.current.value = appFSM.current;
});

appFSM.on('initialized', async () => {
  render(appContainer, html`<${App} />`);
  console.log('FSM.initialized');
  await appFSM.go('viewing', 'all');
});

appFSM.on('viewing', async (prev, filter) => {
  console.log('FSM.viewing:', prev, filter);
  actions.setFilter(filter);
});

appFSM.on('filtering', async (prev, filter) => {
  console.log('FSM.filtering:', prev, filter);
  actions.setFilter(filter);
  await appFSM.go('viewing', filter);
});

// FSM event handlers - coordinate state changes
appFSM.on('adding', async (prev, data) => {
  console.log('FSM.adding:', prev, data);
  actions.addTodo(data);
  await appFSM.go('viewing');
});

// Components - pure UI functions
const TodoInput = () => {
  const textSignal = signal('');

  const handleInput = async (e) => {
    //console.log('INPUT:', e);
    //textSignal.value = e.target.value;
  };
  
  effect(async () => {
    console.log('TodoInput effect - text changed:', textSignal.value);
    if (textSignal.value.trim())
      await appFSM.go('adding', textSignal.value);
  }, [textSignal.value]);

  const handleKeyPress = async (e) => {
    console.log('KEYPRESS:', e.key, textSignal.value);
    if (e.key === 'Enter' && e.target.value.trim()) {
      textSignal.value = e.target.value;
      //textSignal.value = '';
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
        oninput=${handleInput}
      />
    </div>
  `;
};

// filter todo based on state
const filterTodos = (todos, filter) => {
  /*
  const show = (t, f) => {
    return filter == 'completed' && t.completed
        || filter == 'active' && !t.completed
        || true
  });
  return todos.filter(t => show(t.completed));
  */
  return todos;
};

const FilterButton = ({ filter, label, active }) => {
  const onclick = async () => {
    await appFSM.go('filtering', filter);
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
  console.log('Rendering TodoItem:', todo);

  effect(() => {
    console.log('TodoItem effect - todo changed:', todo.id, todo.completed.value);
    eventStreamHandler({ type: 'todo-updated', todo });
  }, [todo.completed.value]);

  const onToggle = () => {
    actions.toggleTodo(todo.id);
  };

  const onDelete = () => {
    actions.deleteTodo(todo.id);
  };

  return html`
    <li class=${'todo-item' + (todo.completed.value ? ' completed' : '')}>
      <input
        type="checkbox"
        checked=${todo.completed.value}
        onchange=${() => onToggle(todo.id)}
      />
      <span class="todo-text">${todo.text}</span>
      <button
        class="delete-btn"
        onclick=${() => onDelete(todo.id)}
      >Delete</button>
    </li>
  `;
};

const TodoList = ({ todos, filter }) => {
  //console.log('Rendering TodoList with todos:', todos.value);

  if (todos.value.length === 0) {
    const message = filter.value === 'all'
      ? 'No todos yet. Add one above!'
      : `No ${filter.value} todos.`;

    return html`<div class="empty-state">${message}</div>`;
  }

  return html`
    <ul class="todo-list">
      ${todos.value.map(todo =>
        html`<${TodoItem} todo=${todo} />`
      )}
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

const App = () => {
  return html`
    <div class="todo-app">
      <h1>FSM + uhtml Todo List</h1>
      <${StateInfo}
        appState=${appState.current}
        filter=${appState.filter}
        todos=${appState.todos}
      />
      <${TodoInput}
        inputText=${appState.inputText}
        onAdd=${actions.setInputText}
      />
      <${FilterControls}
        filter=${appState.filter}
        onFilterChange=${actions.setFilter}
      />
      <${TodoList}
        todos=${appState.todos}
        filter=${appState.filter}
      />
    </div>
  `;
};

// Initialize
await appFSM.go('initialized');

appState.todos.value = [...Array(3)].map((_, i) => actions.addTodo(`todo ${i}`));
