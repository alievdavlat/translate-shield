/* global window, document */
;(function (global) {
  'use strict'

  var PROBES = [
    {
      id: 'simple',
      label: 'Plain sentence',
      question: 'What wrapper does the engine inject, and is the original TextNode detached?',
      build: function (host) {
        host.appendChild(document.createTextNode('There are 4 lights!'))
      },
    },
    {
      id: 'interpolated',
      label: 'Value between two text runs',
      question: 'Does the engine give the number its own segment, or merge the sentence?',
      build: function (host) {
        host.appendChild(document.createTextNode('Total: '))
        host.appendChild(document.createTextNode('19.99'))
        host.appendChild(document.createTextNode(' EUR per order'))
      },
    },
    {
      id: 'number-only',
      label: 'Bare number',
      question: 'Does a pure number get wrapped at all?',
      build: function (host) {
        host.appendChild(document.createTextNode('42'))
      },
    },
    {
      id: 'conditional',
      label: 'Conditional text with a sibling',
      question: 'The removeChild crash shape. Is the text node detached while the sibling stays?',
      build: function (host) {
        host.appendChild(document.createTextNode('There are 4 lights!'))
        var tail = document.createElement('span')
        tail.textContent = ' (status)'
        host.appendChild(tail)
      },
    },
    {
      id: 'inline-nested',
      label: 'Nested inline elements',
      question: 'Does the engine reorder inline elements for target-language word order?',
      build: function (host) {
        host.appendChild(document.createTextNode('The '))
        var bold = document.createElement('b')
        bold.textContent = 'quick'
        host.appendChild(bold)
        host.appendChild(document.createTextNode(' brown '))
        var italic = document.createElement('i')
        italic.textContent = 'fox'
        host.appendChild(italic)
        host.appendChild(document.createTextNode(' jumps over the lazy dog'))
      },
    },
    {
      id: 'list',
      label: 'List items',
      question: 'Are list items translated independently or merged into one segment?',
      build: function (host) {
        var list = document.createElement('ul')
        ;['First light', 'Second light', 'Third light'].forEach(function (text) {
          var item = document.createElement('li')
          item.appendChild(document.createTextNode(text))
          list.appendChild(item)
        })
        host.appendChild(list)
      },
    },
    {
      id: 'attributes',
      label: 'Attributes (title, alt, placeholder)',
      question: 'Does the engine translate attributes, and does that mutate the DOM?',
      build: function (host) {
        var titled = document.createElement('span')
        titled.title = 'There are 4 lights in the room'
        titled.textContent = 'hover me'
        host.appendChild(titled)

        var image = document.createElement('img')
        image.alt = 'There are 4 lights'
        image.width = 1
        image.height = 1
        image.src =
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        host.appendChild(image)

        var field = document.createElement('input')
        field.type = 'text'
        field.placeholder = 'There are 4 lights'
        field.setAttribute('aria-label', 'placeholder probe')
        host.appendChild(field)
      },
    },
    {
      id: 'translate-no',
      label: 'translate="no"',
      question: 'Is the documented opt-out actually honoured by this engine?',
      build: function (host) {
        host.setAttribute('translate', 'no')
        host.appendChild(document.createTextNode('There are 4 lights! Total: 19.99 EUR'))
      },
    },
    {
      id: 'notranslate-class',
      label: 'class="notranslate"',
      question: 'Is the legacy Google opt-out honoured by this engine?',
      build: function (host) {
        host.className = 'notranslate'
        host.appendChild(document.createTextNode('There are 4 lights! Total: 19.99 EUR'))
      },
    },
    {
      id: 'input-value',
      label: 'Input value',
      question: 'Does the engine rewrite form values the app reads back?',
      build: function (host) {
        var field = document.createElement('input')
        field.type = 'text'
        field.value = 'There are 4 lights'
        field.setAttribute('aria-label', 'value probe')
        host.appendChild(field)
      },
      read: function (host) {
        var field = host.querySelector('input')
        return field ? field.value : host.textContent
      },
    },
    {
      id: 'shadow',
      label: 'Shadow DOM',
      question: 'Does the engine reach into a shadow root? Nobody has documented this.',
      build: function (host) {
        var mount = document.createElement('div')
        host.appendChild(mount)
        if (!mount.attachShadow) {
          host.appendChild(document.createTextNode('[shadow DOM unsupported here]'))
          return
        }
        var root = mount.attachShadow({ mode: 'open' })
        root.appendChild(document.createTextNode('There are 4 lights inside a shadow root!'))
      },
      read: function (host) {
        var mount = host.firstElementChild
        if (!mount || !mount.shadowRoot) return host.textContent
        return mount.shadowRoot.textContent
      },
    },
    {
      id: 'plural-one',
      label: 'Singular agreement',
      question: 'Grammar risk: what does the target language do at 1?',
      build: function (host) {
        host.appendChild(document.createTextNode('There is 1 light in the room.'))
      },
    },
    {
      id: 'plural-many',
      label: 'Plural agreement',
      question: 'Compare with the singular probe. If they differ, digit swapping is unsafe.',
      build: function (host) {
        host.appendChild(document.createTextNode('There are 5 lights in the room.'))
      },
    },
    {
      id: 'digits',
      label: 'Digit systems and separators',
      question: 'Does the engine reshape digits or number separators for the target locale?',
      build: function (host) {
        host.appendChild(
          document.createTextNode('Prices: 1,234.56 and 21 and 100% on the 3rd of May 2026'),
        )
      },
    },
    {
      id: 'burst-target',
      label: 'Sustained updates target',
      question: 'Under many writes per second, does the engine loop or fall behind?',
      build: function (host) {
        host.appendChild(document.createTextNode('There are 4 lights!'))
      },
    },
    {
      id: 'dynamic',
      label: 'Content added after translation',
      question: 'Does the engine re-translate late content, and how fast?',
      build: function (host) {
        host.appendChild(document.createTextNode('waiting for the experiment'))
      },
    },
  ]

  /**
   * Renders every probe into the page and captures references to the exact text
   * nodes that existed before any translator touched them.
   */
  function build(container) {
    return PROBES.map(function (definition) {
      var section = document.createElement('section')
      section.className = 'probe'

      var heading = document.createElement('h3')
      heading.textContent = definition.label
      shieldFromTranslation(heading)
      section.appendChild(heading)

      var question = document.createElement('p')
      question.className = 'probe-question notranslate'
      question.textContent = definition.question
      shieldFromTranslation(question)
      section.appendChild(question)

      var host = document.createElement('div')
      host.className = 'probe-host'
      host.setAttribute('data-probe', definition.id)
      definition.build(host)
      section.appendChild(host)

      container.appendChild(section)

      var read = definition.read || function (element) {
        return element.textContent
      }

      return {
        id: definition.id,
        label: definition.label,
        question: definition.question,
        host: host,
        read: function () {
          return read(host)
        },
        textNodes: collectTextNodes(host),
        before: read(host),
      }
    })
  }

  function shieldFromTranslation(element) {
    element.setAttribute('translate', 'no')
    element.classList.add('notranslate')
  }

  function collectTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false)
    var nodes = []
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue && walker.currentNode.nodeValue.trim()) {
        nodes.push(walker.currentNode)
      }
    }
    var elements = root.querySelectorAll('*')
    Array.prototype.forEach.call(elements, function (element) {
      if (!element.shadowRoot) return
      nodes = nodes.concat(collectTextNodes(element.shadowRoot))
    })
    return nodes
  }

  global.Probes = { build: build, definitions: PROBES }
})(window)
