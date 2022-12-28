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

  function matchesPageName(term: string) {
    const allPages = editor.space.listPages();
    for (const pageMeta of allPages) {
      if (pageMeta.name.toUpperCase() === term.toUpperCase()) {
        return pageMeta.name;
      }
    }
    return;
  }

  function stripSurroundingPunctation(s: string) {
    return s.replace(/^[-\/]/, "").replace(/[,;.]$/, "");
  }


  return decoratorStateField(state => {

    const widgets: any[] = [];
    syntaxTree(state).iterate({
      enter: ({ type, from, to }) => {
        if (isCursorInRange(state, [from, to])) return;

        if (type.name === "Paragraph") {
          const rawText = state.sliceDoc(from, to);

          let doc = nlp(rawText);

          /* check for recognized entities */
          for (let otopic of doc.topics().out('array')) {
            let topic = stripSurroundingPunctation(otopic);

            let local_from = from + rawText.indexOf(topic);
            let local_to = local_from + topic.length;

            // don't highlight existing links
            if (rawText.slice(local_from - from, local_from - from + 2) === "[[") continue;

            const dec = Decoration.replace({
              widget: new RecognizedWidget(topic, editor.editorView!, local_from, local_to, "sb-recognized-entity")
            });
            widgets.push(dec.range(local_from, local_to));
          }


          /* check for unlinked pages */
          for (let ng of doc.ngrams({ min: 1, max: 4 })) {
            let ngram = matchesPageName(ng.normal);
            if (!ngram) continue;

            let local_from = from + rawText.toLowerCase().indexOf(ngram.toLowerCase());
            let local_to = local_from + ngram.length;
            const dec = Decoration.replace({
              widget: new RecognizedWidget(ngram, editor.editorView!, local_from, local_to, "sb-recognized-page")
            });
            widgets.push(dec.range(local_from, local_to));
          }
        }
      },
    });
    return Decoration.set(widgets, true);
  });
}
