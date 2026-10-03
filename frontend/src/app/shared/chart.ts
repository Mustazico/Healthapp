import { Component, DestroyRef, effect, ElementRef, inject, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

/** Resolves a CSS colour (including `light-dark()` system tokens) to an rgb string for canvas use. */
export function resolveColor(cssValue: string): string {
  const el = document.createElement('span');
  el.style.color = cssValue;
  el.style.display = 'none';
  document.body.appendChild(el);
  const color = getComputedStyle(el).color;
  el.remove();
  return color;
}

@Component({
  selector: 'app-chart',
  template: `<canvas #canvas></canvas>`,
  styles: `
    :host { display: block; position: relative; height: 240px; }
  `,
})
export class ChartView {
  readonly config = input.required<ChartConfiguration>();
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
