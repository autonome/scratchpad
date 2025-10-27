const context = [];

export function signal(value) {
  const subscriptions = new Set();
  const holder = { value };

  const handler = { 
    get(obj, prop) {
      //console.log('handler.get(): obj, prop', obj, prop);
      const observer = context[context.length - 1]
      if (observer) subscriptions.add(observer);
      return holder.value;
    },
    set(obj, prop, v) {
      //console.log('handler.set(): set obj, prop, new val', obj, prop, v);
      holder.value = v;
      for (const observer of subscriptions) {
        observer.execute();
      }
      return Reflect.get(holder, 'value');
    }
  };

  return new Proxy(holder, handler);
};

/*
export function reactSignal(value) {
  const subscriptions = new Set();

  const read = () => {
    const observer = context[context.length - 1]
    if (observer) subscriptions.add(observer);
    return value;
  };

  const write = (newValue) => {
    value = newValue;
    for (const observer of subscriptions) {
      observer.execute()
    }
  };

  return [read, write];
};
*/

export function effect(fn) {
  const effect = {
    execute() {
      context.push(effect);
      fn();
      context.pop();
    }
  };

  effect.execute();
};

// Template processor
export function html (template, ...values) {
  // Create a unique ID for this template instance
  const templateId = 'tpl_' + Math.random().toString(36).substr(2, 9);
  window.htmlEventHandlers = window.htmlEventHandlers || {};

  // Process the template and values
  let htmlString = '';
  for (let i = 0; i < template.length; i++) {
    htmlString += template[i];

    if (i < values.length) {
      const value = values[i];

      // Check if this value is a function (event handler)
      if (typeof value === 'function') {
        // Store the function globally with unique ID
        const handlerId = 'h_' + Math.random().toString(36).substr(2, 9);
        window.htmlEventHandlers[handlerId] = value;

        // Replace with inline handler call
        htmlString += `window.htmlEventHandlers.${handlerId}(event)`;
      } else if (Array.isArray(value)) {
        // Handle arrays (like mapped components)
        htmlString += value.join('');
      } else {
        // Regular value
        htmlString += value;
      }
    }
  }

  return htmlString;
};
