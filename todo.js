import { effect, html, signal, render } from './uhtml.js';
import StateMachine from './fsm.js';

// Application state signals
const todos = signal([]);
const inputValue = signal('');
const currentFilter = signal('all');

// Todo state machine - models the lifecycle of individual todos
const createTodoFSM = (id) => {
  return new StateMachine({
    initial: 'pending',
    states: {
      pending: ['completed', 'editing'],
      completed: ['pending', 'editing'],
      editing: ['pending', 'completed']
    }
  });
};

// App state machine - models the overall application state
const appFSM = new StateMachine({
  initial: 'viewing',
  states: {
    viewing: ['adding', 'filtering'],
    adding: ['viewing'],
    filtering: ['viewing']
  }
});

// Todo data structure
let todoCounter = 0;

const createTodo = (text) => ({
  id: ++todoCounter,
  text: text,
  state: 'pending',
  fsm: createTodoFSM(todoCounter),
  created: new Date()
});

// State management functions
const addTodo = (text) => {
  console.log('addTodo called with:', text);
  if (text.trim()) {
    const newTodo = createTodo(text.trim());
    console.log('Creating new todo:', newTodo);
    todos.value = [...todos.value, newTodo];
    inputValue.value = '';
    console.log('Todos updated, count:', todos.value.length);
  }
};

const toggleTodo = async (id) => {
  const todoList = [...todos.value];
  const todo = todoList.find(t => t.id === id);

  if (todo) {
    const newState = todo.state === 'pending' ? 'completed' : 'pending';

    try {
      await todo.fsm.go(newState);
      todo.state = newState;
      todos.value = todoList;
    } catch (error) {
      console.error('Invalid state transition:', error);
    }
  }
};

const deleteTodo = (id) => {
  todos.value = todos.value.filter(t => t.id !== id);
};

const filteredTodos = signal([]);

// Reactive effect to update filtered todos when todos or filter changes
effect(() => {
  const filter = currentFilter.value;
  const todoList = todos.value;

  switch (filter) {
    case 'active':
      filteredTodos.value = todoList.filter(t => t.state === 'pending');
      break;
    case 'completed':
      filteredTodos.value = todoList.filter(t => t.state === 'completed');
      break;
    default:
      filteredTodos.value = todoList;
  }
});

// Set up FSM event handlers
appFSM.on('*', (prev, next) => {
  console.log(`App state: ${prev} → ${next}`);
});

appFSM.on('adding', () => {
  const input = document.querySelector('.todo-input');
  if (input) input.focus();
});

// Components
const TodoInput = ({ value, onAdd, fsm }) => {
  const onInput = e => value.value = e.target.value;

  const onKeyPress = async e => {
    if (e.key === 'Enter') {
      console.log('Enter pressed, input value:', value.value);
      try {
        await fsm.go('adding');
        onAdd(value.value);
        await fsm.go('viewing');
      } catch (error) {
        console.error('FSM transition error:', error);
      }
    }
  };

  return html`
    <div class="input-section">
      <input
        type="text"
        class="todo-input"
        placeholder="What needs to be done?"
        value=${value.value}
        oninput=${onInput}
        onkeypress=${onKeyPress}
      />
    </div>
  `;
};

const FilterControls = ({ currentFilter, onFilterChange, fsm }) => {
  const handleFilterClick = async (filter) => {
    await fsm.go('filtering');
    onFilterChange(filter);
    await fsm.go('viewing');
  };

  return html`
    <div class="controls">
      <button
        class=${currentFilter.value === 'all' ? 'active' : ''}
        onclick=${() => handleFilterClick('all')}
      >All</button>
      <button
        class=${currentFilter.value === 'active' ? 'active' : ''}
        onclick=${() => handleFilterClick('active')}
      >Active</button>
      <button
        class=${currentFilter.value === 'completed' ? 'active' : ''}
        onclick=${() => handleFilterClick('completed')}
      >Completed</button>
    </div>
  `;
};

const TodoItem = ({ todo, onToggle, onDelete }) => {
  console.log('rendering TODO');
  const handleToggle = () => onToggle(todo.id);
  const handleDelete = () => onDelete(todo.id);

  return html`
    <li class="${todo.state === 'completed' ? 'todo-item completed' : 'todo-item'}">
      <input
        type="checkbox"
        checked=${todo.state === 'completed'}
        onchange=${handleToggle}
      />
      <span class="todo-text">${todo.text}</span>
      <button
        class="delete-btn"
        onclick=${handleDelete}
      >
        Delete
      </button>
    </li>
  `;
};

const TodoList = ({ todos, currentFilter, onToggle, onDelete }) => {
  console.log('Rendering TodoList', todos.length, 'items');
  let message = '';
  if (todos.length === 0) {
    message = currentFilter === 'all'
      ? 'No todos yet. Add one above!'
      : `No ${currentFilter} todos.`;
  }

  const handleFilterChange = (filter) => {
    currentFilter.value = filter;
  };

  return html`
    ${FilterControls({
      currentFilter,
      onFilterChange: handleFilterChange,
      fsm: appFSM
    })}
    <ul class="todo-list">
      ${todos.map(todo => TodoItem({ todo, onToggle, onDelete }))}
    </ul>
    <div class="empty-state">${message}</div>
  `;
};

const StateInfo = ({ appState, currentFilter, todos }) => {
  const totalTodos = todos.length;
  const completedTodos = todos.filter(t => t.state === 'completed').length;
  const activeTodos = totalTodos - completedTodos;

  return html`
    <div class="state-info">
      <strong>App State:</strong> ${appState} |
      <strong>Filter:</strong> ${currentFilter} |
      <strong>Todos:</strong> ${totalTodos} total, ${activeTodos} active, ${completedTodos} completed
    </div>
  `;
};

const App = () => {
  return html`
    <div class="todo-app">
      <h1>FSM + uhtml Todo List</h1>
      ${StateInfo({
        appState: appFSM.current,
        currentFilter: currentFilter.value,
        todos: todos.value
      })}
      ${TodoInput({
        value: inputValue,
        onAdd: addTodo,
        fsm: appFSM
      })}
      ${TodoList({
        todos: filteredTodos.value,
        currentFilter: currentFilter.value,
        onToggle: toggleTodo,
        onDelete: deleteTodo
      })}
    </div>
  `;
};

// Initialize the app
const appContainer = document.getElementById('app');

appContainer.append(
  html`<${App} />`
);

// Add some sample data for demonstration
setTimeout(() => {
  addTodo('Learn about state machines');
  addTodo('Build reactive UIs with uhtml');
  addTodo('Combine FSM with reactive programming');
}, 100);
