import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export function parseDecimal(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Text input that accepts both "," and "." as decimal separator (iOS nb keyboards use comma). */
@Directive({
  selector: 'input[appDecimal]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DecimalInput), multi: true }],
  host: {
    inputmode: 'decimal',
    autocomplete: 'off',
    '(input)': 'onInput($any($event.target).value)',
    '(blur)': 'onTouched()',
    '(focus)': '$any($event.target).select()',
  },
})
export class DecimalInput implements ControlValueAccessor {
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private onChange: (v: number | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(v: number | null): void {
    this.el.nativeElement.value = v == null || Number.isNaN(v) ? '' : String(v).replace('.', ',');
  }
  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.el.nativeElement.disabled = disabled;
  }
  protected onInput(raw: string): void {
    this.onChange(parseDecimal(raw));
  }
}
