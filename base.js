import { effect, html, signal } from './uhtml.js';
import StateMachine from './fsm.js';

const Textarea = value => {
  const txt = signal(value || '');

  return html`
    <textarea oninput=${e => txt.value = e.target.value}>
      ${txt.value}
    </textarea>
  `;
};

const Card = props => {
  const txt = signal(props.text || '');

  const onInput = e => {
    console.log('onInput:', e.target.value);
  };

  return html`
    <div @input=${onInput}>
      ${Textarea(txt.value)}
    </div>
  `;
};

const Cards = props => {
  return html`
    <div>
      ${props.entries.map(entry => Card(entry))}
    </div>
  `;
};

let data = {
	layout: 'grid',	/* list, manual */
  sort: 'last-modified', /* last-modified, title, created */
  order: 'desc', /* asc, desc */
  filter: '', /* search string */
  tags: [], /* array of tags */
  items: []
};

Array.from(Array(10)).forEach((_, i) => data.items.push({
  key: i,
  text: `item${i}`,
  created: new Date().toISOString(),
  lastModified: new Date().toISOString(),
}));

console.log(data);

const sm = new StateMachine({
  layout : 'grid',
  states : {
    grid   : ['list', 'manual'],
    list   : ['grid', 'manual'],
    manual : ['grid', 'list']
  }
});

sm.on('*', (prev, next) => {
  console.log('State changed from ' + prev + ' to ' + next);
});

sm.on('grid', (next) => {
  console.log('on(grid)', next);
});

/*
sm.on('before:start', (prev, param) => {
  console.log('Reset with param === "foo": ' + param === 'foo');
});

sm.on('after:start', function(next) {
  console.log('Going to ' + next);
});

sm.on('end', function(prev, param) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      console.log('Now at end, 2 + 2 = ' + param);
      resolve();
    }, 1500);
  });
});
*/

//await sm.go('end', 2 + 2);

document.body.append(
  //html`<${Counter} />`
  //html`<${Textarea} defaultvalue=${data.note} cb=${cb}/>`
  //html`<${Card} defaultvalue=${data.note} />`
  html`<${Cards} entries=${data.items} />`
);

