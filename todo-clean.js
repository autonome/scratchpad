import { effect, html, signal, render } from './uhtml.js';
import StateMachine from './fsm.js';

// Core state - single source of truth
const appState = {
  todos: signal([]),
  filter: signal('all'),
  inputText: signal('')
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
      appState.todos.value = [...appState.todos.value, newTodo];
      appState.inputText.value = '';
    }
  },

  deleteTodo: (id) => {
    appState.todos.value = appState.todos.value.filter(t => t.id !== id);
  },

  toggleTodo: (id) => {
    const todo = appState.todos.value.find(t => t.id === id);
    if (todo) {
      todo.completed.value = !todo.completed.value;
    }
  },

  setFilter: (filter) => {
    appState.filter.value = filter;
  },

  setInputText: (text) => {
    appState.inputText.value = text;
  }
};

// Derived state - computed automatically from base state
const filteredTodos = signal([]);
effect(() => {
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
});

// FSM event handlers - coordinate state changes
appFSM.on('adding', async () => {
  actions.addTodo(appState.inputText.value);
  await appFSM.go('viewing');
});

appFSM.on('filtering', async (prev, filter) => {
  actions.setFilter(filter);
  await appFSM.go('viewing');
});

// Components - pure UI functions
const TodoInput = () => {
  const handleKeyPress = async (e) => {
    if (e.key === 'Enter' && appState.inputText.value.trim()) {
      await appFSM.go('adding');
    }
  };

  return html`
    <div class="input-section">
      <input
        type="text"
        class="todo-input"
        placeholder="What needs to be done?"
        value=${appState.inputText.value}
        oninput=${e => actions.setInputText(e.target.value)}
        onkeypress=${handleKeyPress}
      />
    </div>
  `;
};

const FilterButton = ({ filter, label }) => {
  const handleClick = async () => {
    await appFSM.go('filtering', filter);
  };

  return html`
    <button
      class=${appState.filter.value === filter ? 'active' : ''}
      onclick=${handleClick}
    >${label}</button>
  `;
};

const FilterControls = () => {
  return html`
    <div class="controls">
      ${FilterButton({ filter: 'all', label: 'All' })}
      ${FilterButton({ filter: 'active', label: 'Active' })}
      ${FilterButton({ filter: 'completed', label: 'Completed' })}
    </div>
  `;
};

const TodoItem = ({ todo }) => {
  return html`
    <li class="todo-item ${todo.completed.value ? 'completed' : ''}">
      <input
        type="checkbox"
        checked=${todo.completed.value}
        onchange=${() => actions.toggleTodo(todo.id)}
      />
      <span class="todo-text">${todo.text}</span>
      <button
        class="delete-btn"
        onclick=${() => actions.deleteTodo(todo.id)}
      >Delete</button>
    </li>
  `;
};

const TodoList = () => {
  const todos = filteredTodos.value;

  if (todos.length === 0) {
    const message = appState.filter.value === 'all'
      ? 'No todos yet. Add one above!'
      : `No ${appState.filter.value} todos.`;

    return html`<div class="empty-state">${message}</div>`;
  }

  return html`
    <ul class="todo-list">
      ${todos.map(todo => TodoItem({ todo }))}
    </ul>
  `;
};

const StateInfo = () => {
  const total = appState.todos.value.length;
  const completed = appState.todos.value.filter(t => t.completed.value).length;
  const active = total - completed;

  return html`
    <div class="state-info">
      <strong>App:</strong> ${appFSM.current} |
      <strong>Filter:</strong> ${appState.filter.value} |
      <strong>Todos:</strong> ${total} total, ${active} active, ${completed} completed
    </div>
  `;
};

const App = () => {
  return html`
    <div class="todo-app">
      <h1>FSM + uhtml Todo List (Clean)</h1>
      ${StateInfo()}
      ${TodoInput()}
      ${FilterControls()}
      ${TodoList()}
    </div>
  `;
};

// Initialize
const appContainer = document.getElementById('app');
render(appContainer, App());

// Sample data
setTimeout(() => {
  actions.addTodo('Learn about state machines');
  actions.addTodo('Build reactive UIs with uhtml');
  actions.addTodo('Combine FSM with reactive programming');
}, 100);
