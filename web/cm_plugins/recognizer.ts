import { Decoration, EditorView, syntaxTree, WidgetType } from "../deps.ts";
import { Editor } from "../editor.tsx";
import {
  decoratorStateField,
  isCursorInRange,
} from "./util.ts";

import nlp from 'compromise';
import plg from 'compromise-stats';
nlp.plugin(plg);


class RecognizedWidget extends WidgetType {
  constructor(
    readonly entity: string,
    readonly editorView: EditorView,
    readonly from: number,
    readonly to: number,
    readonly className: string
  ) {
    super();
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.textContent = this.entity;
    el.className = this.className;
    el.setAttribute("title", "Hotlink " + this.entity);
    el.addEventListener("click", e => {
      this.editorView.dispatch({
        changes: {
          insert: "[[" + this.entity + "]]",
          from: this.from,
          to: this.to
        }
      })
    });
    return el;
  }
}






export function recognizerPlugin(editor: Editor) {

  performance.mark('start_hashmap')
  const allPages: Map<string, string> = new Map<string, string>();
  for (const page of editor.space.listPages()) {
    allPages.set(page.name.toLowerCase(), page.name);
  }
  performance.mark('end_hashmap')
  performance.measure('hashmap', 'start_hashmap', 'end_hashmap')


  return decoratorStateField(state => {

    const widgets: any[] = [];
    syntaxTree(state).iterate({
      enter: ({ type, from, to }) => {
        if (isCursorInRange(state, [from, to])) return;

        if (type.name === "Paragraph") {
          const rawText = state.sliceDoc(from, to);
          const rawTextLower = rawText.toLowerCase();
          const doc = nlp(rawText);

          /* check for recognized entities */
          performance.mark("before_nlp")
          for (let topic of doc.topics().json({ offset: true })) {
            // don't highlight existing links
            if (topic.text.indexOf("[[") >= 0) continue;

            const recognized_from = from + topic.offset.start;
            const recognized_to = recognized_from + topic.offset.length;

            const dec = Decoration.replace({
              widget: new RecognizedWidget(topic.text, editor.editorView!, recognized_from, recognized_to, "sb-recognized-entity")
            });
            widgets.push(dec.range(recognized_from, recognized_to));
          }
          performance.mark("after_nlp")
          performance.measure('nlp_cost', 'before_nlp', 'after_nlp');


          /* check for unlinked pages */
          performance.mark("before_ngrams")
          for (let ng of doc.ngrams({ min: 1, max: 3 })) {
            performance.mark('before_page_exists');
            let page_name = allPages.get(ng.normal);
            performance.mark('after_page_exists');
            performance.measure('page_exists', 'before_page_exists', 'after_page_exists');
            if (!page_name) continue;

            let recognized_from = from + rawTextLower.indexOf(ng.normal);
            let recognized_to = recognized_from + ng.normal.length;
            const dec = Decoration.replace({
              widget: new RecognizedWidget(page_name, editor.editorView!, recognized_from, recognized_to, "sb-recognized-page")
            });
            widgets.push(dec.range(recognized_from, recognized_to));
          }

          performance.mark("after_ngrams")
          performance.measure("ngram_cost", "before_ngrams", "after_ngrams")
        }
      },
    });
    return Decoration.set(widgets, true);
  });
}
