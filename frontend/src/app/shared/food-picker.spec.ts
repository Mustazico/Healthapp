import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { FoodPicker } from './food-picker';
import { FoodApi } from '../core/api';

describe('FoodPicker', () => {
  let api: {
    search: ReturnType<typeof vi.fn>;
    searchOnline: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      search: vi.fn(() => of([])),
      searchOnline: vi.fn(() => of([])),
    };
    await TestBed.configureTestingModule({
      imports: [FoodPicker],
      providers: [
        { provide: FoodApi, useValue: api },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
  });

  async function createPicker() {
    const fixture = TestBed.createComponent(FoodPicker);
    fixture.detectChanges();
    return fixture;
  }

  function enterQuery(fixture: Awaited<ReturnType<typeof createPicker>>, query: string) {
    const input = fixture.nativeElement.querySelector('input[name="q"]') as HTMLInputElement;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function waitForSearch() {
    return new Promise((resolve) => setTimeout(resolve, 600));
  }

  it('does not search online while searching saved foods', async () => {
    const fixture = await createPicker();
    enterQuery(fixture, 'havre');
    await waitForSearch();

    expect(api.searchOnline).not.toHaveBeenCalled();
  });

  it('searches online only after selecting the new-foods tab', async () => {
    const fixture = await createPicker();
    enterQuery(fixture, 'havre');
    await waitForSearch();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    fixture.detectChanges();
    await waitForSearch();

    expect(api.searchOnline).toHaveBeenCalledWith('havre');
  });

  it('does not search online for queries shorter than two characters', async () => {
    const fixture = await createPicker();
    enterQuery(fixture, 'h');
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(api.searchOnline).not.toHaveBeenCalled();
  });
});
