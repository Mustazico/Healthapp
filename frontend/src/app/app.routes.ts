import { Routes } from '@angular/router';
import { authGuard } from './core/auth';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.LoginPage) },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./features/today/today').then((m) => m.TodayPage) },
      { path: 'add', loadComponent: () => import('./features/add/add').then((m) => m.AddPage) },
      { path: 'add/food/:id', loadComponent: () => import('./features/add/add-food').then((m) => m.AddFoodPage) },
      { path: 'add/recipe/:id', loadComponent: () => import('./features/add/add-recipe').then((m) => m.AddRecipePage) },
      { path: 'scan', loadComponent: () => import('./features/scan/scan').then((m) => m.ScanPage) },
      { path: 'foods', loadComponent: () => import('./features/foods/foods').then((m) => m.FoodsPage) },
      { path: 'foods/new', loadComponent: () => import('./features/foods/food-edit').then((m) => m.FoodEditPage) },
      { path: 'foods/:id', loadComponent: () => import('./features/foods/food-edit').then((m) => m.FoodEditPage) },
      { path: 'recipes', loadComponent: () => import('./features/recipes/recipes').then((m) => m.RecipesPage) },
      { path: 'recipes/new', loadComponent: () => import('./features/recipes/recipe-edit').then((m) => m.RecipeEditPage) },
      { path: 'recipes/:id', loadComponent: () => import('./features/recipes/recipe-edit').then((m) => m.RecipeEditPage) },
      { path: 'stats', loadComponent: () => import('./features/stats/stats').then((m) => m.StatsPage) },
      { path: 'more', loadComponent: () => import('./features/more/more').then((m) => m.MorePage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
