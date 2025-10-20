/*

// usage:

const appKey = 'blah';

const defaultState = {
  itemCount: 0,
  activeId: '',
  items: [],
}

const storagingState = await StorageProxy(appKey, defaultModel, false);

// triggers storage writes on assignment

storagingState.items = ['foo', 'bar', 'baz'];

*/

// TODO: debounce me
export default async function StorageProxy(stateKey, defaultState, reset = false, debug = false) {
	let storage = {
		store: localStorage,
		async get(key) {
			let val = this.store.getItem(key);
			if (val) {
				val = JSON.parse(val);
			}
			return val;
		},
		async set(key, value) {
      if (debug) console.log('storage.set', key, value);
      try {
			this.store.setItem(key, JSON.stringify(value));
      } catch(ex) {
        console.error('storage.set', ex)
      }
		}
	};

	let stateData = await storage.get(stateKey);
  if (debug) console.log('stateData', stateData);

	// blow away db
  if (reset) {
    if (debug) console.log('StorageProxy: blew away state');
    stateData = null;
  }

  if (!stateData) {
    stateData = defaultState;
    await storage.set(stateKey, stateData)
  }

  let stateHandler = { 
    async set(obj, prop, v) {
      if (debug) console.log('set obj, prop, new val', obj, prop, v);
      stateData[prop] = v;
      //console.log('set stateData', stateData)
      await storage.set(stateKey, stateData);
      //console.log('setted stateData')
      return Reflect.get(...arguments);
    }
  };

  return new Proxy(stateData, stateHandler);
}
