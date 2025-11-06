const context = [];

export function signal(value) {
  const subscriptions = new Set();
  const holder = { value };

  const handler = {
    get(obj, prop) {
      //console.log('handler.get(): obj, prop', obj, prop);
      const observer = context[context.length - 1]
      if (observer) {
        subscriptions.add(observer);
        // Let the effect know which subscription set it's in
        if (observer.addSubscription) {
          observer.addSubscription(subscriptions);
        }
      }
      return holder[prop];
    },
    set(obj, prop, v) {
      //console.log('handler.set(): set obj, prop, new val', obj, prop, v);
      holder[prop] = v;
      for (const observer of subscriptions) {
        observer.execute();
      }
      return true;
    }
  };

  return new Proxy(holder, handler);
};

export function effect(fn) {
  const subscriptions = new Set();

  const effect = {
    execute() {
      context.push(effect);
      fn();
      context.pop();
    },
    dispose() {
      // Remove this effect from all signal subscriptions
      for (const signal of subscriptions) {
        signal.delete(effect);
      }
      subscriptions.clear();
    },
    addSubscription(signalSubs) {
      subscriptions.add(signalSubs);
    }
  };

  effect.execute();

  return effect.dispose;
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

// Cache for tracking rendered content per container
const renderCache = new WeakMap();

// Helper to create a temporary container for parsing HTML
function parseHTML(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  return Array.from(template.content.childNodes);
}

// Helper to check if two nodes are similar enough to update rather than replace
function isSameNodeType(node1, node2) {
  if (!node1 || !node2) return false;
  if (node1.nodeType !== node2.nodeType) return false;
  if (node1.nodeType === Node.ELEMENT_NODE) {
    return node1.tagName === node2.tagName;
  }
  return true;
}

// Diff and patch two DOM nodes
function patchNode(oldNode, newNode) {
  // Text nodes - just update content
  if (oldNode.nodeType === Node.TEXT_NODE) {
    if (oldNode.textContent !== newNode.textContent) {
      oldNode.textContent = newNode.textContent;
    }
    return oldNode;
  }

  // Element nodes - update attributes
  if (oldNode.nodeType === Node.ELEMENT_NODE) {
    // Update attributes
    const oldAttrs = oldNode.attributes;
    const newAttrs = newNode.attributes;

    // Remove old attributes
    for (let i = oldAttrs.length - 1; i >= 0; i--) {
      const attr = oldAttrs[i];
      if (!newNode.hasAttribute(attr.name)) {
        oldNode.removeAttribute(attr.name);
      }
    }

    // Set new attributes
    for (let i = 0; i < newAttrs.length; i++) {
      const attr = newAttrs[i];
      if (oldNode.getAttribute(attr.name) !== attr.value) {
        oldNode.setAttribute(attr.name, attr.value);
      }
    }

    // Recursively patch children
    const oldChildren = Array.from(oldNode.childNodes);
    const newChildren = Array.from(newNode.childNodes);

    const maxLength = Math.max(oldChildren.length, newChildren.length);
    for (let i = 0; i < maxLength; i++) {
      const oldChild = oldChildren[i];
      const newChild = newChildren[i];

      if (!oldChild && newChild) {
        // Add new child
        oldNode.appendChild(newChild.cloneNode(true));
      } else if (oldChild && !newChild) {
        // Remove old child
        oldNode.removeChild(oldChild);
      } else if (isSameNodeType(oldChild, newChild)) {
        // Patch existing child
        patchNode(oldChild, newChild);
      } else {
        // Replace child with different type
        oldNode.replaceChild(newChild.cloneNode(true), oldChild);
      }
    }
  }

  return oldNode;
}

// Helper to get the key from a node
function getNodeKey(node) {
  if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-key')) {
    return node.getAttribute('data-key');
  }
  return null;
}

// Smart render function that reuses DOM nodes with key-based reconciliation
export function render(container, htmlString) {
  // Get or create cache entry for this container
  if (!renderCache.has(container)) {
    renderCache.set(container, {
      html: null
    });
  }

  const cache = renderCache.get(container);

  // If the HTML is the same, don't do anything
  if (cache.html === htmlString) {
    console.log('render: HTML unchanged, skipping update');
    return;
  }

  console.log('render: HTML changed, patching DOM');

  // Parse the new HTML
  const newNodes = parseHTML(htmlString);
  const oldNodes = Array.from(container.childNodes);

  // Build a map of keyed old nodes
  const oldKeyedNodes = new Map();
  const oldUnkeyedNodes = [];
  oldNodes.forEach(node => {
    const key = getNodeKey(node);
    if (key) {
      oldKeyedNodes.set(key, node);
    } else {
      oldUnkeyedNodes.push(node);
    }
  });

  // Process new nodes
  let oldUnkeyedIndex = 0;
  const processedOldNodes = new Set();

  newNodes.forEach((newNode, i) => {
    const key = getNodeKey(newNode);
    let oldNode = null;

    if (key) {
      // Try to find matching keyed node
      oldNode = oldKeyedNodes.get(key);
      if (oldNode) {
        processedOldNodes.add(oldNode);

        // Check if node is in the right position
        const currentIndex = oldNodes.indexOf(oldNode);
        if (currentIndex !== i) {
          // Move to correct position
          if (i < oldNodes.length) {
            container.insertBefore(oldNode, oldNodes[i]);
          } else {
            container.appendChild(oldNode);
          }
        }

        // Patch the node
        if (isSameNodeType(oldNode, newNode)) {
          patchNode(oldNode, newNode);
        } else {
          // Replace if types don't match
          container.replaceChild(newNode, oldNode);
          processedOldNodes.delete(oldNode);
        }
      } else {
        // New keyed node - insert it
        if (i < oldNodes.length) {
          container.insertBefore(newNode, oldNodes[i]);
        } else {
          container.appendChild(newNode);
        }
      }
    } else {
      // Unkeyed node - match by position with unkeyed old nodes
      while (oldUnkeyedIndex < oldUnkeyedNodes.length) {
        const candidate = oldUnkeyedNodes[oldUnkeyedIndex];
        if (!processedOldNodes.has(candidate)) {
          oldNode = candidate;
          break;
        }
        oldUnkeyedIndex++;
      }

      if (oldNode && isSameNodeType(oldNode, newNode)) {
        processedOldNodes.add(oldNode);

        // Check if node is in the right position
        const currentIndex = oldNodes.indexOf(oldNode);
        if (currentIndex !== i) {
          if (i < oldNodes.length) {
            container.insertBefore(oldNode, oldNodes[i]);
          } else {
            container.appendChild(oldNode);
          }
        }

        patchNode(oldNode, newNode);
        oldUnkeyedIndex++;
      } else {
        // Insert new node
        if (i < container.childNodes.length) {
          container.insertBefore(newNode, container.childNodes[i]);
        } else {
          container.appendChild(newNode);
        }
      }
    }
  });

  // Remove old nodes that weren't reused
  oldNodes.forEach(node => {
    if (!processedOldNodes.has(node) && container.contains(node)) {
      container.removeChild(node);
    }
  });

  cache.html = htmlString;
};
