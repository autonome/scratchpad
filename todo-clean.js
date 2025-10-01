import { effect, html, signal, render } from './uhtml.js';
import StateMachine from './fsm.js';

// Core state - single source of truth
const appState = {
  todos: [],
  filter: 'all',
  inputText: ''
};

// Todo factory
const createTodo = (text) => ({
  id: Date.now(),
  text: text.trim(),
  completed: signal(false),
  created: new Date()
});

// State machine for application flow
const appFSM = new StateMachine({
  initial: 'viewing',
  states: {
    viewing: ['adding', 'filtering'],
    adding: ['viewing'],
    filtering: ['viewing']
  }
});

// Actions - pure functions that modify state
const actions = {
  addTodo: (text) => {
    if (text.trim()) {
      const newTodo = createTodo(text);
      appState.todos = [...appState.todos, newTodo];
      appState.inputText = '';
    }
  },

  deleteTodo: (id) => {
    appState.todos = appState.todos.filter(t => t.id !== id);
  },

  toggleTodo: (id) => {
    const todo = appState.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  },

  setFilter: (filter) => {
    appState.filter = filter;
  },

  setInputText: (text) => {
    appState.inputText = text;
  }
};

// Derived state - computed automatically from base state
const filteredTodos = signal([]);

// Initialize filteredTodos immediately with current todos
const updateFilteredTodos = () => {
  const todos = appState.todos.value;
  const filter = appState.filter.value;

  switch (filter) {
    case 'active':
      filteredTodos.value = todos.filter(t => !t.completed.value);
      break;
    case 'completed':
      filteredTodos.value = todos.filter(t => t.completed.value);
      break;
    default:
      filteredTodos.value = todos;
  }
};

/*
// Run initial update
updateFilteredTodos();

// Set up reactive effect
effect(() => {
  updateFilteredTodos();
});
*/

// FSM event handlers - coordinate state changes
appFSM.on('adding', async () => {
  actions.addTodo(appState.inputText);
  await appFSM.go('viewing');
});

appFSM.on('filtering', async (prev, filter) => {
  actions.setFilter(filter);
  await appFSM.go('viewing');
});

// Components - pure UI functions
const TodoInput = ({ inputText, onAdd, fsm }) => {
  const textSignal = signal(inputText);
  const inputState = signal('idle');

  // Component-level FSM for input states
  const inputFSM = new StateMachine({
    initial: 'idle',
    states: {
      idle: ['typing', 'submitting'],
      typing: ['idle', 'submitting'],
      submitting: ['idle']
    }
  });

  // FSM handlers
  inputFSM.on('typing', () => {
    inputState.value = 'typing';
  });

  inputFSM.on('submitting', async () => {
    inputState.value = 'submitting';
    await fsm.go('adding');
    await inputFSM.go('idle');
  });

  inputFSM.on('idle', () => {
    inputState.value = 'idle';
    textSignal.value = '';
  });

  const handleInput = async (e) => {
    textSignal.value = e.target.value;
    onAdd(e.target.value);
    if (inputState.value === 'idle' && e.target.value.trim()) {
      await inputFSM.go('typing');
    }
  };

  const handleKeyPress = async (e) => {
    if (e.key === 'Enter' && textSignal.value.trim()) {
      await inputFSM.go('submitting');
    }
  };

  return html`
    <div class="input-section">
      <input
        type="text"
        class="todo-input"
        placeholder="What needs to be done?"
        value=${textSignal.value}
        oninput=${handleInput}
        onkeypress=${handleKeyPress}
      />
    </div>
  `;
};

const FilterButton = ({ filter, label, currentFilter, onFilterChange, fsm }) => {
  const handleClick = async () => {
    await fsm.go('filtering', filter);
  };

  return html`
    <button
      class=${currentFilter === filter ? 'active' : ''}
      onclick=${handleClick}
    >${label}</button>
  `;
};

const FilterControls = ({ currentFilter, onFilterChange, fsm }) => {
  return html`
    <div class="controls">
      <${FilterButton} filter="all" label="All" currentFilter=${currentFilter} onFilterChange=${onFilterChange} fsm=${fsm} />
      <${FilterButton} filter="active" label="Active" currentFilter=${currentFilter} onFilterChange=${onFilterChange} fsm=${fsm} />
      <${FilterButton} filter="completed" label="Completed" currentFilter=${currentFilter} onFilterChange=${onFilterChange} fsm=${fsm} />
    </div>
  `;
};

const TodoItem = ({ todo, onToggle, onDelete }) => {
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

const TodoList = ({ todos, currentFilter, onToggle, onDelete }) => {
  console.log('Rendering TodoList with todos:', todos.length);
  const todosSignal = signal(Array.isArray(todos) ? todos : []);
  const componentState = signal('displaying');

  // Component-level FSM for managing display states
  const listFSM = new StateMachine({
    initial: 'displaying',
    states: {
      displaying: ['updating'],
      updating: ['displaying']
    }
  });

  // FSM handlers
  listFSM.on('updating', () => {
    componentState.value = 'updating';
  });

  listFSM.on('displaying', () => {
    componentState.value = 'displaying';
  });

  // Update local signal when props change, with safety check
  if (Array.isArray(todos)) {
    todosSignal.value = todos;
  }

  const todosList = todosSignal.value;

  if (todosList.length === 0) {
    const message = currentFilter === 'all'
      ? 'No todos yet. Add one above!'
      : `No ${currentFilter} todos.`;

    return html`<div class="empty-state">${message}</div>`;
  }

  return html`
    <ul class="todo-list">
      ${todosList.map(todo =>
        html`<${TodoItem} todo=${todo} onToggle=${onToggle} onDelete=${onDelete} />`
      )}
    </ul>
  `;
};

const StateInfo = ({ appState, currentFilter, todos = [] }) => {
  const todosSignal = signal(todos);

  const todosList = todosSignal.value || [];
  const total = todosList.length;
  const completed = todosList.filter(t => t.completed).length;
  const active = total - completed;

  return html`
    <div class="state-info">
      <strong>App:</strong> ${appState} |
      <strong>Filter:</strong> ${currentFilter} |
      <strong>Todos:</strong> ${total} total, ${active} active, ${completed} completed
    </div>
  `;
};

const App = () => {
  return html`
    <div class="todo-app">
      <h1>FSM + uhtml Todo List (Clean)</h1>
      <${StateInfo}
        appState=${appFSM.current}
        currentFilter=${appState.filter.value}
        todos=${appState.todos.value}
      />
      <${TodoInput}
        inputText=${appState.inputText.value}
        onAdd=${actions.setInputText}
        fsm=${appFSM}
      />
      <${FilterControls}
        currentFilter=${appState.filter.value}
        onFilterChange=${actions.setFilter}
        fsm=${appFSM}
      />
      <${TodoList}
        todos=${filteredTodos.value}
        currentFilter=${appState.filter.value}
        onToggle=${actions.toggleTodo}
        onDelete=${actions.deleteTodo}
      />
    </div>
  `;
};

// Initialize
const appContainer = document.getElementById('app');
appContainer.append(html`<${App} />`);

// Sample data
setTimeout(() => {
  actions.addTodo('Learn about state machines');
  /*
  actions.addTodo('Build reactive UIs with uhtml');
  actions.addTodo('Combine FSM with reactive programming');
  */
}, 100);
