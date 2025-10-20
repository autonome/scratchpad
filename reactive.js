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
