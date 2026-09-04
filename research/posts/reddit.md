# Reddit

Post to **r/reactjs** first. Wait a few days before r/webdev, and do not cross-post the same text
to three subreddits in one hour. Both r/javascript and r/webdev remove work-of-mine posts outside
their showcase threads, so check the current rules in the sidebar before you post there.

Put the links in a comment on your own post, not in the body.

---

## Title options

1. Chrome's translator detaches React's text nodes, and the crash guard everyone pastes only hides it
2. I measured what five browser translators do to a live React DOM
3. Why your React app throws NotFoundError only for users with translation on

Option 1 for r/reactjs. Option 2 for r/webdev. Option 3 if you want the error message to do the work.

---

## Body

If you have ever seen this in your error tracker with no local repro:

    Uncaught NotFoundError: Failed to execute 'removeChild' on 'Node':
    The node to be removed is not a child of this node.

check whether those sessions had page translation on.

Chrome's translator does not edit your text node. It builds a new one, wraps it in
`<font style="vertical-align: inherit">`, puts the wrapper where your node was, and detaches
yours. React still holds the detached one. So `removeChild` and `insertBefore` throw, and
`nodeValue` writes go somewhere nobody can see.

The crash is the loud half. The quiet half is worse. A counter keeps incrementing in state and
never changes on screen.

shuhei described this in facebook/react#11538 back in 2018. Dan Abramov closed it won't-fix. The
guard from that thread is still what most people paste:

    const original = Node.prototype.removeChild
    Node.prototype.removeChild = function (child) {
      if (child.parentNode !== this) return child
      return original.apply(this, arguments)
    }

It stops the throw. It does not put your update on screen. In my comparison run the guard gave
zero errors and zero updates: the counter stuck, deleted text still visible, and a flipped ternary
rendering both branches at once.

I spent about a month measuring this properly. Chrome, Edge, Firefox, Yandex, and Google's
translate_a/element.js widget. Some of it was not what I expected.

**Edge and Firefox do not have this bug.** They rewrite the text node in place and leave it
connected, so your writes land. Narrower, not immune: when they merge adjacent text runs they
detach too, 2 nodes against Chrome's 3 on the same probe.

**Chrome translates the viewport, not the page.** I fired ten signals at an idle translator, plus
a no-signal control. Only `element.scrollIntoView()` worked, at 168ms. Nine did nothing for 10
seconds, including a real mouse wheel and a real mouse move from the browser itself. So it is not
about trusted input, and not about scrolling the window. The element has to enter the viewport.

**That rule broke one of my own conclusions.** I had published that Chrome never repairs a
restored text node. My probe sat below the fold. With the element in view, Chrome repaired it in
210ms. Off screen it never did, however long I waited.

**Restoring the node costs the reader the wrong language.** That is what the existing shims do:
put the original back and let the translator catch up. Five replicates of four updates, sampled
every 50ms: 100 to 150ms of source-language text per update, 500 to 600ms across a sequence.
Writing into the wrapper instead: 0ms in all twenty.

**Numbers do not always merge.** Splicing a new digit into an already-translated sentence works in
Dutch. In Russian it breaks the grammar, because `Intl.PluralRules` puts 4 in `few` and 7 in
`many` and the noun follows the category. An early build of mine shipped
`Здесь 7 лампочки!`, which is wrong. It now refuses when the plural category, digit count or
sentence shape changes, or the locale is unknown, and falls back to the correct number in the
source language.

**Safari is unmeasured.** No Windows build since 2012 and Playwright's WebKit carries no
translator. I left the row empty rather than guessing.

The library that came out of this is `translate-shield`. It forwards React's writes into the
wrapper the reader can actually see instead of restoring the node. On Edge and Firefox it does
nothing, which is the correct behaviour there. It does not translate anything and it does not
replace an i18n library. If you only want the lint rule, `eslint-plugin-react-google-translate`
catches the risky JSX shapes and is worth running either way.

Every figure above comes from a JSON file in the repo, produced by a Playwright spec you can
re-run. Links in a comment.

---

## First comment

    Live demo, turn on your own browser's translation and watch the two panels come apart:
    https://google-translate-simulation.netlify.app/

    Source, every raw recording and the specs that produced them:
    https://github.com/alievdavlat/translate-shield

    npm: https://www.npmjs.com/package/translate-shield

---

## Images

Reddit allows one image per text post, so use the mechanism diagram if you use any:

    https://raw.githubusercontent.com/alievdavlat/translate-shield/main/research/screenshots/fig-mechanism.png
