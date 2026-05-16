import { container, heading, button, themeClass, themedBox } from './styles.css.ts';

console.log('Container class:', container);
console.log('Heading class:', heading);
console.log('Button class:', button);
console.log('Theme class:', themeClass);
console.log('Themed box class:', themedBox);

document.querySelector('#app')!.innerHTML = `
  <div class="${container}">
    <h1 class="${heading}">Bun + Vanilla Extract 🔥</h1>
    <button class="${button}">Click me!</button>
    <div class="${themeClass}">
      <div class="${themedBox}">
        Themed box with vanilla-extract vars
      </div>
    </div>
  </div>
`;
