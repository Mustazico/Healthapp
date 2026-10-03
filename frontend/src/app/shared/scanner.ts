import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { isValidEan, normalizeBarcode } from '../core/barcode';

const HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE],
  ],
]);

@Component({
  selector: 'app-scanner',
  imports: [FormsModule, MatButton, MatFormField, MatLabel, MatInput],
  template: `
    <div class="viewport">
      <video #video playsinline muted autoplay></video>
      @if (error()) {
        <div class="overlay">{{ error() }}</div>
      } @else {
        <div class="aim"></div>
      }
    </div>
    <form class="manual" (ngSubmit)="submitManual()">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Eller skriv inn strekkoden</mat-label>
        <input matInput name="ean" inputmode="numeric" autocomplete="off" [ngModel]="manual()" (ngModelChange)="manual.set($event)" />
      </mat-form-field>
      <button mat-flat-button type="submit" [disabled]="!manualValid()">Søk</button>
    </form>
  `,
  styles: `
    :host { display: block; }
    .viewport {
      position: relative;
      aspect-ratio: 4 / 3;
      max-height: 55vh;
      width: 100%;
      background: #000;
      border-radius: 16px;
      overflow: hidden;
    }
    video { width: 100%; height: 100%; object-fit: cover; }
    .aim {
      position: absolute;
      inset: 30% 12%;
      border: 3px solid rgba(255, 255, 255, 0.85);
      border-radius: 12px;
      box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.3);
    }
    .overlay {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      color: #fff;
    }
    .manual { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    .manual mat-form-field { flex: 1; }
  `,
})
export class Scanner {
  readonly detected = output<string>();

  protected readonly error = signal<string | null>(null);
  protected readonly manual = signal('');
  protected readonly manualValid = computed(() => isValidEan(this.manual().trim()));

  private video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private controls?: IScannerControls;
  private done = false;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop();
    });
  }

  private async start(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.error.set('Kameraet krever HTTPS. Skriv inn strekkoden under.');
      return;
    }
    try {
      const reader = new BrowserMultiFormatReader(HINTS, { delayBetweenScanAttempts: 150 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        this.video().nativeElement,
        (result) => {
          if (!result || this.done) return;
          const code = normalizeBarcode(result.getText());
          if (code) this.emit(code);
        },
      );
      // Component may have been destroyed while waiting for camera permission.
      if (this.destroyed || this.done) controls.stop();
      else this.controls = controls;
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      this.error.set(
        name === 'NotAllowedError'
          ? 'Appen har ikke tilgang til kameraet. Gi tilgang i innstillingene, eller skriv inn strekkoden.'
          : 'Fant ikke noe kamera. Skriv inn strekkoden under.',
      );
    }
  }

  protected submitManual(): void {
    const code = normalizeBarcode(this.manual());
    if (code) this.emit(code);
  }

  private emit(code: string): void {
    this.done = true;
    this.stop();
    navigator.vibrate?.(80);
    this.detected.emit(code);
  }

  private stop(): void {
    this.controls?.stop();
    this.controls = undefined;
  }
}
