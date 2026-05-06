# Ultimate Editor — виджет редактирования объектов для ArcGIS Experience Builder

Пользовательский виджет ExB для создания, редактирования и удаления объектов FeatureLayer прямо на карте. Полностью заменяет стандартный Editor-виджет ESRI там, где нужна тонкая настройка разрешений, полей и поведения.

---

## Текущее Состояние

Текущая версия виджета собрана как рабочая основная ветка с локальным рефактором runtime-кода:

- `widget.tsx` оставлен точкой сборки состояния и панелей, а toolbar вынесен в `components/Toolbar.tsx`.
- Popup lifecycle вынесен в `editor/popupManager.ts`, чтобы не смешивать отключение popups с основной бизнес-логикой.
- Undo/redo helpers вынесены в `editor/history.ts`, а операции applyEdits/queryFeatures — в `editor/featureEdits.ts`.
- Debug helpers собраны в `runtime/debug.ts`; логи включаются только через `window.__UE_DEBUG = true`.
- Polygon geometry edit остается vertex-only: целиковый move полигона не разрешается, при этом point/polyline не меняются относительно текущей логики.

Проверка: локальный `tsc --noEmit` по TypeScript-файлам виджета проходит без ошибок.

---

## Содержание

- [Архитектура](#архитектура)
- [Файлы и за что отвечает каждый](#файлы)
- [Жизненный цикл виджета](#жизненный-цикл)
- [Режимы sketchMode](#режимы-sketchmode)
- [Инструменты toolbar](#инструменты-toolbar)
- [Панели (правая колонка)](#панели)
- [Логика выбора объектов](#логика-выбора-объектов)
- [Геометрические операции](#геометрические-операции)
- [История (Undo / Redo)](#история-undo--redo)
- [Политика полей (FieldPolicy)](#политика-полей-fieldpolicy)
- [Конфигурация (config)](#конфигурация-config)
- [Всплывающие окна карты](#всплывающие-окна-карты)
- [Отладка](#отладка)

---

## Архитектура

```
widget.tsx                        ← точка входа, рендерит toolbar + нужную панель
  └─ useUltimateEditor.ts         ← «мозг»: агрегирует всё состояние, экспортирует handlers
       ├─ useSelection.ts         ← управление выделением объектов
       ├─ useGeometry.ts          ← SketchViewModel, создание / редактирование / разрезка геометрии
       ├─ popupManager.ts         ← отключение и восстановление popups карты
       ├─ featureEdits.ts         ← query/applyEdits helpers для сохранения и истории
       └─ history.ts              ← снимки undo/redo операций

src/runtime/components/
  Toolbar.tsx                     ← верхняя панель инструментов
  IdlePanel.tsx                   ← шаблоны для создания нового объекта
  FeatureFormPanel.tsx            ← форма атрибутов (новый / существующий объект)
  BatchEditPanel.tsx              ← пакетное редактирование нескольких объектов
  MergePanel.tsx                  ← интерфейс объединения полигонов

src/runtime/debug.ts              ← единый gated debug logging через window.__UE_DEBUG
src/runtime/utils/ueUtils.ts      ← вспомогательные функции (resolveRuleEffective, applyDefaultValues, …)
src/runtime/styles.ts             ← css-in-js стили виджета
config.ts / src/config.ts         ← схема настроек виджета + bridge для импортов runtime/setting
config.json                       ← default runtime config
```

---

## Файлы

### `widget.tsx`

Корневой React-компонент. Ответственность:
- монтирует `JimuMapViewComponent` и передаёт `jmv` в `useUltimateEditor`
- рендерит **toolbar** (кнопки инструментов)
- выбирает нужную **панель** на основе текущего состояния (`sketchMode`, количества выделенных объектов, `mergeMode`)
- управляет диалогом подтверждения удаления

Правила отображения панелей:

| Условие | Панель |
|---|---|
| `(idle\|creating)` + 0 выделенных | `IdlePanel` — шаблоны |
| `reshaping` + 1 выделенный | `FeatureFormPanel` (режим нового объекта) |
| `(idle\|updating)` + 1 выделенный | `FeatureFormPanel` (режим существующего объекта) |
| `idle` + 2+ выделенных | `BatchEditPanel` |
| `mergeMode === true` | `MergePanel` |

---

### `useUltimateEditor.ts`

Главный хук. Создаёт весь state виджета и экспортирует handlers для `widget.tsx`. Ключевые обязанности:

**Инициализация при смене карты (`onActiveViewChange`)**
1. Восстанавливает попапы предыдущего вида
2. Отключает все попапы на новом виде (виджет перехватывает клики сам)
3. Вычисляет списки `editableLayers` (allowCreate) и `attrEditableLayers` (allowAttrUpdate)
4. Навешивает обработчики `immediate-click` и `drag` на view
5. Инициализирует `useSelection` и `useGeometry`

**Обработчик клика (`immediate-click`)**
- Пропускает клики во время любого активного sketchMode
- Ищет верхний слой из результатов `hitTest`, у которого `allowAttrUpdate === true`
- В режиме `none` заменяет выделение (`replace`), в режиме `add/remove` добавляет/убирает
- При клике в пустое место снимает выделение (или отменяет geomEdit)

**Drag box-select**
- Работает только при `tool === 'add' | 'remove'` и `sketchMode === 'idle'`
- Рисует пунктирный прямоугольник через временный GraphicsLayer
- По окончании тянет все объекты верхнего выделяемого слоя, попавшие в extent

**Popup-менеджмент**
- При активации виджета сохраняет текущее состояние попапов всех слоёв и глобальные флаги (`autoOpenEnabled`, `defaultPopupTemplateEnabled`)
- Отключает попапы
- При деактивации или смене карты — восстанавливает
- Следит за добавлением новых слоёв на карту и сразу отключает попапы и у них

---

### `useGeometry.ts`

Отвечает за все операции с геометрией через `SketchViewModel`. Создаёт служебный `GraphicsLayer` для черновых графиков.

#### Публичные методы

| Метод | Что делает |
|---|---|
| `setupOnView(view)` | Инициализирует SVM и GraphicsLayer, вешает слушатели `create` / `update` |
| `startCreate(layer, template, extraAttrs, onCreated)` | Запускает рисование нового объекта. После завершения: `applyEdits(add)` → переход в `reshaping` для правки геометрии |
| `confirmCreate(draftAttrs)` | Сохраняет атрибуты и финальную геометрию нарисованного объекта, выходит из `reshaping` |
| `cancelCreate()` | Удаляет только что созданный объект (rollback), выходит из `reshaping` |
| `startGeometryEdit(item, onDone)` | Копирует графику в SVM, прячет оригинал через `layerView.filter`, запускает `update(reshape)`; для polygon разрешено редактирование вершин, но блокируется whole-feature move |
| `commitUpdate(draftAttrs)` | Применяет изменённую геометрию + атрибуты через `applyEdits(update)` |
| `startSplit(item, onDone)` | Рисует линию разреза. После завершения: `geometryEngine.cut` → `applyEdits(delete+add)` |
| `startReshapeByLine(item, onDone)` | Рисует линию изменения границы. Алгоритм: находит пересечения линии с кольцом полигона → строит два патча → выбирает лучший по площади |
| `cancel()` | Отменяет любой активный режим, очищает GraphicsLayer |

#### Особенности

**Режим `reshaping` после создания** — объект уже записан в БД, но пользователю показывается черновик в SVM. Это позволяет редактировать вершины перед финальным сохранением атрибутов. При `confirmCreate` геометрия из SVM применяется через `applyEdits(update)`.

**Скрытие оригинала** — при `startGeometryEdit` и в процессе `reshaping` оригинальный объект скрывается через `layerView.filter = { where: 'OID <> N' }`, чтобы не двоилось с черновиком SVM. Фильтр снимается при выходе.

**Перезапуск SVM-сессии** — при удалении вершины JSAPI автоматически завершает update-сессию. Виджет перехватывает это событие (state === 'cancel'/'complete' при `sketchMode === 'updating'/'reshaping'`) и через `setTimeout(50ms)` создаёт новый `Graphic` с сохранённой геометрией и рестартует SVM. Это предотвращает потерю черновика.

**Алгоритм reshape-by-line** (`buildReshapedPolygonGeometry`):
1. Находит все пересечения нарисованной линии с внешним кольцом полигона
2. Берёт первое и последнее пересечение как точки входа/выхода
3. Строит два возможных «патча» (срезаемая часть по линии + две дуги обхода кольца)
4. Определяет, лежит ли середина линии внутри или снаружи полигона
5. Если внутри — применяет `difference` (срезает), если снаружи — `union` (добавляет)
6. Выбирает вариант с минимальным изменением площади

---

### `useSelection.ts`

Управляет массивом выделенных объектов. Каждый элемент: `{ graphic, layer, oid }`.

- Режимы: `replace` (сбросить и выбрать один), `add` (добавить), `remove` (убрать)
- Дедупликация по `oid + layerKey`
- При `replace` кешируются полные атрибуты объекта через `outFields: ['*']`
- Отвечает за визуальную подсветку выделенных объектов на карте

---

### `IdlePanel.tsx`

Отображается когда ничего не выделено и можно создавать объекты.

Пропсы:
- `templateLayers: FeatureLayer[]` — слои с `allowCreate === true` (вычисляется в `useUltimateEditor`)
- `showAttrHint: boolean` — показывать ли подсказку «кликните объект для редактирования атрибутов» (только в режиме `idle`)
- `onSelectTemplate(layer, template)` — вызывается при выборе шаблона, инициирует рисование

Отображается в двух режимах: `idle` (шаблоны + подсказка) и `creating` (шаблоны без подсказки, чтобы пользователь видел активный шаблон во время рисования).

---

### `FeatureFormPanel.tsx`

Форма атрибутов. Используется и для нового объекта (`isNew === true`), и для редактирования существующего.

- Строит список полей на основе `FieldPolicy` (полученной из `getFieldPolicy(layer)`)
- Скрытые поля (`hidden`) — не показываются
- Readonly-поля — `<input disabled>`
- Кастомные лейблы из конфига
- При `isNew` показывает кнопки «Сохранить» / «Отменить» (без удаления)
- При существующем объекте — дополнительно кнопка «Удалить» (если `allowDelete === true`)
- Кнопка геометрии (checkbox «Геометрия») — только при `canGeom === true`

---

### `BatchEditPanel.tsx`

Появляется при выделении 2+ объектов одного слоя.

- Показывает только поля, помеченные для пакетного редактирования в конфиге
- Сохраняет одинаковое значение во все выделенные объекты через `applyEdits(updateFeatures[])`
- Кнопка «Удалить всё» (если `allowDelete === true`)

---

### `MergePanel.tsx`

Интерфейс объединения полигонов. Активируется кнопкой «Объединить» при 2+ выделенных объектах одного полигонального слоя.

- Список объектов: пользователь выбирает **мастер-объект** (его атрибуты останутся)
- Наведение на элемент списка → вызов `onPreviewMergeItem(oid)` → подсветка геометрии золотистым цветом на карте
- «Объединить»: `geometryEngine.union(все геометрии)` → `applyEdits(delete все + add merged)` с атрибутами мастера

---

### `ueUtils.ts`

Вспомогательные функции без side-эффектов.

| Функция | Описание |
|---|---|
| `resolveRuleEffective(cfg, layer)` | Ищет правило конфига для слоя по `id`, `url` или `title`. Возвращает merged правило с дефолтами |
| `applyDefaultValues(rule)` | Возвращает `Record<string,any>` статических дефолтных значений полей из конфига |
| `applyArcadeDefaults(rule, layer, graphic)` | Выполняет Arcade-выражения для полей с `defaultExpression`, возвращает атрибуты |
| `isFeatureLayer(layer)` | Тип-гард — проверяет `type === 'feature'` |
| `layerKey(layer)` | Стабильный строковый ключ слоя: `id` или `url` или `title` |

---

## Жизненный цикл

```
Экземпляр виджета создан
  │
  ▼
onActiveViewChange(jmv)  ← JimuMapViewComponent вызывает при готовности карты
  ├─ отключить попапы
  ├─ вычислить editableLayers / attrEditableLayers
  ├─ useSelection.setupOnView(view)
  ├─ useGeometry.setupOnView(view)  ← создаёт SVM + GraphicsLayer
  └─ навесить click/drag обработчики

Пользователь работает
  (клики, рисование, редактирование атрибутов)

Виджет деактивируется (state меняется)
  ├─ geometry.cancel()
  ├─ selection.clearSelection()
  └─ restorePopups()

Виджет уничтожается
  └─ cleanup-функции всех хуков (remove EventHandlers, destroy SVM, remove GraphicsLayers)
```

---

## Режимы sketchMode

Определяются в `useGeometry.ts`. Текущий режим виден через `ue.sketchMode`.

| Режим | Описание |
|---|---|
| `idle` | Ничего активного. Можно выделять, открывать форму |
| `creating` | Пользователь рисует новый объект (SVM.create активен) |
| `reshaping` | Объект только что нарисован, запущен SVM.update(reshape) для правки вершин перед сохранением |
| `updating` | Редактирование геометрии существующего объекта (checkbox «Геометрия» нажат) |
| `splitting` | Пользователь рисует линию разреза |
| `reshapeLine` | Пользователь рисует линию изменения границы полигона |

---

## Инструменты toolbar

| Кнопка | tool | Поведение |
|---|---|---|
| **+ Выбор** | `add` | Каждый клик/drag добавляет в выделение |
| **− Выбор** | `remove` | Каждый клик/drag убирает из выделения |
| **Очистить** | — | `clearSelection()` |
| **↶ Отменить** | — | Undo из стека истории |
| **↷ Вернуть** | — | Redo из стека истории |
| **Разрезать** | `split` | `startSplit` на верхнем видимом полигональном слое с `allowGeomUpdate` |
| **Изменить форму** | `reshape` | `startReshapeByLine` — reshape-by-line |
| **Геометрия** ☑ | — | `startGeometryEdit` на выделенном объекте |
| **Объединить** | — | Переход в `mergeMode` |

---

## Панели

Переключение панелей — исключительно в `widget.tsx` на основе:
- `ue.sketchMode`
- `sel.length` (количество выделенных)
- `ue.mergeMode`

См. таблицу в разделе [widget.tsx](#widgettsx).

---

## Логика выбора объектов

1. **Одиночный клик** → `hitTest` → первый результат с `allowAttrUpdate === true` в том же слое, что и текущее выделение (или в любом, если выделения нет)
2. **Drag box** → `whenLayerView.queryFeatures(extent)` → аналогичная фильтрация по слою
3. При `tool === 'none'` одиночный клик **заменяет** выделение; при `add/remove` — добавляет/убирает
4. Клик в пустое место при `tool === 'none'` → `clearSelection()`
5. Клик в пустое место при активном `geomEdit` → `geometry.cancel()` + `clearSelection()`

---

## Геометрические операции

### Создание нового объекта

```
IdlePanel → выбор шаблона
  → onStartCreate(layer, template)
    → geometry.startCreate(layer, template, staticAttrs, cb)
      → SVM.create(polygon|polyline|point)
        ← sketchMode: 'creating'
    [пользователь рисует]
      → applyEdits(add)   ← объект сразу в БД
      → cb(layerGraphic)  ← selectGraphic('replace')
      → sketchMode: 'reshaping'
        [пользователь правит вершины]
    → FeatureFormPanel(isNew) → «Сохранить»
      → onSaveNew(draftAttrs)
        → geometry.confirmCreate(draftAttrs)
          → applyEdits(update: geometry + attrs)
          → sketchMode: 'idle'
```

### Редактирование геометрии существующего объекта

```
Форма → checkbox «Геометрия» ON
  → onGeomToggle()
    → geometry.startGeometryEdit(item)
      → layerView.filter = 'OID <> N'   ← скрываем оригинал
      → SVM.update(reshape)
      ← sketchMode: 'updating'
    [правка вершин]
    [для polygon можно менять вершины, но нельзя сдвигать объект целиком]
→ Форма → «Сохранить»
  → onSaveExisting(draftAttrs)
    → geometry.commitUpdate(draftAttrs)
      → applyEdits(update: geometry + attrs)
      → layerView.filter = null
      ← sketchMode: 'idle'
```

---

## История (Undo / Redo)

- Стек ограничен 10 записями (`MAX_HISTORY`)
- Каждая запись: `{ layer, label, before[], after[], currentBefore[], currentAfter[] }`
- `before/after` — снимки атрибутов+геометрии в момент операции
- `currentBefore/currentAfter` — актуальные графики (обновляются при каждом undo/redo, т.к. OID меняется при delete+add)
- Операции, записываемые в историю: `attr-update`, `geometry-update`, `split`, `reshape`, `delete`
- Объединение (merge) в историю **не записывается** (сложно восстановить однозначно)

---

## Политика полей (FieldPolicy)

Функция `getFieldPolicy(layer)` в `useUltimateEditor` возвращает:

```typescript
{
  hidden: Set<string>     // не показывать в форме
  readonly: Set<string>   // показывать как disabled
  labels: Map<string, string>  // кастомные заголовки полей
  order: string[]         // порядок отображения
}
```

Логика:
- Если в конфиге нет секции `fields` для слоя — все поля видны; если `allowAttrUpdate === false` — все readonly
- Если секция `fields` есть — показываются только поля из неё (все остальные → `hidden`)
- Флаг `visible: false` → поле в `hidden`
- Флаг `editable: false` → поле в `readonly`

---

## Конфигурация (config)

Настраивается в панели Setting. Основная структура:

```typescript
interface LayerRule {
  id?: string           // FeatureLayer.id
  url?: string          // FeatureLayer.url (альтернатива id)
  title?: string        // FeatureLayer.title (запасной вариант)
  allowCreate?: boolean
  allowAttrUpdate?: boolean
  allowGeomUpdate?: boolean
  allowDelete?: boolean
  fields?: FieldSetting[]
}

interface FieldSetting {
  name: string
  label?: string
  visible?: boolean      // default: true
  editable?: boolean     // default: true
  defaultValue?: any     // статический дефолт
  defaultExpression?: string  // Arcade-выражение
}
```

Функция `resolveRuleEffective(cfg, layer)` ищет правило в порядке: `id` → `url` → `title`.

---

## Всплывающие окна карты

Виджет **полностью подавляет попапы** пока активен:
- Сохраняет состояние `popupEnabled` каждого слоя и `autoOpenEnabled` вида
- Устанавливает все в `false` + закрывает открытый попап
- При добавлении нового слоя на карту — сразу отключает и у него
- При деактивации/размонтировании — восстанавливает всё через `restorePopups()`

---

## Отладка

```javascript
// В консоли браузера — включить подробные логи:
window.__UE_DEBUG = true
```

Виджет выводит в консоль:
- `[UE][state]` — текущий `sketchMode`, количество выделенных, `oid`, `mergeMode` при каждом рендере
- `[UE][widget] rule-check` — разрешения конкретного слоя при выделении
- `[UE] creatableLayers` / `[UE] attrEditableLayers` — при пересчёте доступных слоёв
- `[UE] applyEdits ...` — ошибки операций с данными
