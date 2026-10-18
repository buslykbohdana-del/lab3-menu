import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';

// === БЛОК 1: допоміжні функції і налаштування програми ===
const DEFAULT_FILE = 'data.json';

// Друкує помилку українською у stderr і завершує програму з кодом 1
function fail(message) {
  console.error(`Помилка: ${message}`);
  process.exit(1);
}

// Додатне ціле число (для id та --limit)
function parsePositiveInt(value) {
  const n = Number(value);
  if (value.trim() === '' || !Number.isInteger(n) || n <= 0) {
    throw new Error(`«${value}» — потрібне додатне ціле число.`);
  }
  return n;
}

// Невід’ємне число (для --max-price)
function parsePrice(value) {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n) || n < 0) {
    throw new Error(`«${value}» — потрібне невід’ємне число.`);
  }
  return n;
}

// Збирає повторювані значення опції в масив
function collect(value, previous) {
  return [...previous, value];
}

// Читає й розбирає JSON-файл, шлях бере з глобальної опції --file
function loadData() {
  const path = program.opts().file;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') fail(`файл «${path}» не знайдено.`);
    fail(`не вдалося прочитати «${path}» (${err.code}).`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    fail(`файл «${path}» містить некоректний JSON: ${err.message}`);
  }
  if (!data || !Array.isArray(data.dishes)) {
    fail(`у файлі «${path}» немає масиву «dishes».`);
  }
  return data;
}

function findDish(data, id) {
  const dish = data.dishes.find((d) => d.id === id);
  if (!dish) fail(`страви з id ${id} не існує.`);
  return dish;
}

function formatShort(d) {
  const mark = d.available ? '' : ' [немає в наявності]';
  return `${d.id}. ${d.name} — ${d.price} грн (${d.category})${mark}`;
}

function printDishes(dishes, emptyMessage = 'Нічого не знайдено.') {
  if (dishes.length === 0) {
    console.log(emptyMessage);
    return;
  }
  dishes.forEach((d) => console.log(formatShort(d)));
  console.log(`Разом: ${dishes.length}`);
}

function printFull(d) {
  const n = d.nutrition;
  console.log(`Страва №${d.id}: ${d.name}`);
  console.log(`Категорія: ${d.category}`);
  console.log(`Ціна: ${d.price} грн`);
  console.log(`Вага: ${d.weight} г`);
  console.log(`Позначки: ${d.tags.length ? d.tags.join(', ') : '—'}`);
  console.log(`Інгредієнти: ${d.ingredients.join(', ')}`);
  console.log(`Харчова цінність: ${n.calories} ккал, білки ${n.protein} г, жири ${n.fat} г, вуглеводи ${n.carbs} г`);
  console.log(`В наявності: ${d.available ? 'так' : 'ні'}`);
}

// Іде по шляху виду nutrition.protein або ingredients.0
function getByPath(obj, path) {
  let current = obj;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(key in current)) {
      return { found: false };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

const program = new Command();
program
  .name('menu')
  .description('Консольна програма для перегляду меню ресторану з JSON-файлу')
  .version('1.0.0', '-V, --version', 'показати версію програми')
  .helpOption('-h, --help', 'показати довідку')
  .option('-f, --file <path>', 'шлях до JSON-файлу з меню', DEFAULT_FILE)
  .exitOverride()
  .configureOutput({ outputError: () => {} });

// === БЛОК 2: загальні команди list, show, field ===
program
  .command('list')
  .description('показати стислий список страв')
  .option('-l, --limit <n>', 'максимальна кількість страв у списку', parsePositiveInt)
  .action((options) => {
    const { dishes } = loadData();
    const shown = options.limit ? dishes.slice(0, options.limit) : dishes;
    printDishes(shown, 'Меню порожнє.');
  });

program
  .command('show')
  .description('показати одну страву повністю')
  .argument('<id>', 'номер (id) страви', parsePositiveInt)
  .action((id) => {
    printFull(findDish(loadData(), id));
  });

program
  .command('field')
  .description('показати значення окремого поля страви')
  .argument('<id>', 'номер (id) страви', parsePositiveInt)
  .argument('<path>', 'шлях до поля через крапку, напр. nutrition.protein або ingredients.0')
  .action((id, path) => {
    const dish = findDish(loadData(), id);
    const result = getByPath(dish, path);
    if (!result.found) fail(`у страви ${id} немає поля «${path}».`);
    if (result.value === null) {
      console.log('null (поле є, але значення не задано)');
    } else if (typeof result.value === 'object') {
      console.log(JSON.stringify(result.value, null, 2));
    } else {
      console.log(result.value);
    }
  });
// === БЛОК 3: команди варіанта category, filter, search ===
program
  .command('category')
  .description('показати страви однієї категорії')
  .argument('<name>', 'назва категорії, напр. Супи (з пробілами в лапках)')
  .action((name) => {
    const { dishes } = loadData();
    const wanted = name.toLowerCase();
    const found = dishes.filter((d) => d.category.toLowerCase() === wanted);
    if (found.length === 0) {
      const categories = [...new Set(dishes.map((d) => d.category))];
      fail(`категорії «${name}» немає. Доступні: ${categories.join(', ')}.`);
    }
    printDishes(found);
  });

program
  .command('filter')
  .description('відібрати страви за позначками та/або граничною ціною')
  .option('-t, --tag <tag>', 'позначка (можна повторювати; страва має мати всі)', collect, [])
  .option('-p, --max-price <n>', 'гранична ціна в грн (включно)', parsePrice)
  .option('-a, --available', 'показати лише страви, які є в наявності')
  .action((options) => {
    const { tag: tags, maxPrice, available } = options;
    if (tags.length === 0 && maxPrice === undefined && !available) {
      fail('вкажіть хоча б одну умову: --tag, --max-price або --available.');
    }
    const { dishes } = loadData();
    const found = dishes.filter((d) => 
      tags.every((t) => d.tags.includes(t.toLowerCase())) &&
      (maxPrice === undefined || d.price <= maxPrice) &&
      (!available || d.available)
    );
    printDishes(found, 'Страв за цими умовами не знайдено.');
  });

program
  .command('search')
  .description('знайти страви за інгредієнтом')
  .argument('<ingredient>', 'інгредієнт або його частина, напр. гриби')
  .action((ingredient) => {
    const { dishes } = loadData();
    const part = ingredient.toLowerCase();
    const found = dishes.filter((d) => 
      d.ingredients.some((i) => i.toLowerCase().includes(part))
    );
    printDishes(found, `Страв з інгредієнтом «${ingredient}» не знайдено.`);
  });
program.parse();