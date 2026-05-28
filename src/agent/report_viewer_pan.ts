export function renderReportViewportPanCss(): string {
  return `      [data-ptywright-report-pan="true"] {
        cursor: grab;
      }
      [data-ptywright-report-panning="true"] {
        cursor: grabbing;
      }`;
}

export function renderReportViewportPanScript(body: string): string {
  return `      (() => {
        const isHtmlElement = (value) => {
          return Boolean(
            value &&
            value.nodeType === 1 &&
            value.dataset &&
            value.style &&
            typeof value.addEventListener === "function"
          );
        };

        const scrollToBottom = (element) => {
          element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        };

        const enableViewportPan = (element) => {
          if (!isHtmlElement(element) || element.dataset.ptywrightReportPan === "true") {
            return;
          }

          element.dataset.ptywrightReportPan = "true";
          let activePointerId = null;
          let startX = 0;
          let startY = 0;
          let startScrollLeft = 0;
          let startScrollTop = 0;
          let moved = false;

          element.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            activePointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startScrollLeft = element.scrollLeft;
            startScrollTop = element.scrollTop;
            moved = false;
            element.dataset.ptywrightReportPanning = "true";
            element.setPointerCapture?.(event.pointerId);
          });

          element.addEventListener("pointermove", (event) => {
            if (activePointerId !== event.pointerId) return;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
              moved = true;
            }
            element.scrollLeft = startScrollLeft - deltaX;
            element.scrollTop = startScrollTop - deltaY;
            if (moved) event.preventDefault();
          });

          const finish = (event) => {
            if (activePointerId !== event.pointerId) return;
            activePointerId = null;
            element.dataset.ptywrightReportPanning = "false";
            element.releasePointerCapture?.(event.pointerId);
          };

          element.addEventListener("pointerup", finish);
          element.addEventListener("pointercancel", finish);
        };
${body}
      })();`;
}
