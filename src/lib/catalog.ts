export type Stage = 1 | 2 | 3;
export type Mode = "single" | "complex";

export type DocKind = "template" | "kit";

export interface CatalogDoc {
  id: string;
  title: string;
  purpose: string;
  kind: DocKind;
  price: number;
  addressee: "gibdd" | "court" | "none";
}

// Цены — демонстрационные, должны задаваться в каталоге владельцем.
export const DOCS: Record<string, CatalogDoc> = {
  gibdd_familiarize: {
    id: "gibdd_familiarize",
    title: "Заявление об ознакомлении с материалами дела в ГИБДД",
    purpose: "Чтобы не давать лукавых показаний, противоречащих реальной доказательной базе.",
    kind: "template",
    price: 990,
    addressee: "gibdd",
  },
  receipt: {
    id: "receipt",
    title: "Расписка о получении денег в счёт компенсации вреда",
    purpose: "Фиксирует возмещение ущерба и отсутствие претензий со стороны потерпевшего. Данные потерпевшего вписываются от руки.",
    kind: "template",
    price: 790,
    addressee: "none",
  },
  victim_requalify_gibdd: {
    id: "victim_requalify_gibdd",
    title: "Заявление потерпевшего о переквалификации на ч. 1 ст. 12.27",
    purpose: "Подписывает потерпевший — способствует назначению штрафа вместо лишения ВУ.",
    kind: "template",
    price: 1290,
    addressee: "gibdd",
  },
  requalify_gibdd: {
    id: "requalify_gibdd",
    title: "Ходатайство о переквалификации с ч. 2 на ч. 1 ст. 12.27 (ГИБДД)",
    purpose: "Просьба к ГИБДД квалифицировать действия по более мягкой части статьи и ограничиться штрафом.",
    kind: "template",
    price: 1290,
    addressee: "gibdd",
  },
  postpone_court: {
    id: "postpone_court",
    title: "Ходатайство об отложении судебного заседания",
    purpose: "Даёт время подготовиться к суду и ознакомиться с делом.",
    kind: "template",
    price: 990,
    addressee: "court",
  },
  objections_kit: {
    id: "objections_kit",
    title: "Комплект для письменных возражений",
    purpose: "Возражение - ключевой документ, необходимый для описания вашей позиции в суде и защиты. Образцы возражений, библиотека самых готовых формулировок и рекомендации по составлению.",
    kind: "kit",
    price: 2490,
    addressee: "court",
  },
  speech_kit: {
    id: "speech_kit",
    title: "Комплект для речи в суде",
    purpose: "Библиотека примеров успешных выступлений по 12.27 ч.2 и ключевые принципы подготовки речи.",
    kind: "kit",
    price: 1990,
    addressee: "court",
  },
  art29_court: {
    id: "art29_court",
    title: "Ходатайство о применении ст. 2.9 КоАП (малозначительность)",
    purpose: "Оформление освобождения от ответственности из-за малозначительности.",
    kind: "template",
    price: 1290,
    addressee: "court",
  },
  requalify_court: {
    id: "requalify_court",
    title: "Ходатайство о переквалификации на ч. 1 ст. 12.27 (суд)",
    purpose: "Оформление переквалификации действий по более мягкой части статьи. Назначение штрафа.",
    kind: "template",
    price: 1290,
    addressee: "court",
  },
  terminate_court: {
    id: "terminate_court",
    title: "Ходатайство о прекращении производства (нет состава)",
    purpose: "Оформление прекращения дела в связи с отсутствием состава правонарушения.",
    kind: "template",
    price: 1490,
    addressee: "court",
  },
  trace_expertise: {
    id: "trace_expertise",
    title: "Ходатайство о назначении трасологической экспертизы",
    purpose: "Проверка, было ли вообще соприкосновение автомобилей.",
    kind: "template",
    price: 1490,
    addressee: "court",
  },
  court_familiarize: {
    id: "court_familiarize",
    title: "Заявление об ознакомлении с материалами дела в суде",
    purpose: "Если в ГИБДД на предыдущих стадиях не удалось ознакомиться с материалами. Чтобы изучить протокол, схему и объяснения до заседания.",
    kind: "template",
    price: 990,
    addressee: "court",
  },
  attach_court: {
    id: "attach_court",
    title: "Ходатайство о приобщении документов к материалам дела",
    purpose: "Чтобы суд официально принял и учёл ваши документы: ходатайства, расписку, заявление потерпевшего, характеристики, фото, экспертизы.",
    kind: "template",
    price: 790,
    addressee: "court",
  },
};

export const STAGES: { id: Stage; short: string; text: string }[] = [
  { id: 1, short: "ГИБДД ещё не связывалась", text: "Я знаю о ДТП, но со мной ещё не связывались сотрудники ГИБДД." },
  { id: 2, short: "Вызвали в ГИБДД", text: "Меня уже вызвали в ГИБДД, но я ещё не посещал подразделение." },
  { id: 3, short: "Впереди суд", text: "Я уже был в ГИБДД, теперь ожидаю суда." },
];

export const STAGE_DOCS: Record<Stage, string[]> = {
  1: ["gibdd_familiarize", "receipt", "victim_requalify_gibdd"],
  2: ["gibdd_familiarize", "requalify_gibdd", "postpone_court"],
  3: ["objections_kit", "speech_kit", "art29_court", "requalify_court", "terminate_court", "trace_expertise", "court_familiarize", "attach_court"],
};

/** Стадия 3: заявление об ознакомлении в суде рекомендуется, если материалов нет. Никогда не скрывается. */
export function isRecommended(stage: Stage, docId: string, hasMaterials: boolean | null): boolean {
  return stage === 3 && docId === "court_familiarize" && hasMaterials === false;
}

export function docsForStage(stage: Stage): CatalogDoc[] {
  return STAGE_DOCS[stage].map((id) => DOCS[id]!);
}

export function cartTotal(ids: string[]): number {
  return ids.reduce((s, id) => s + (DOCS[id]?.price ?? 0), 0);
}

// Демонстрационные цены комплекса по стадиям.
export const COMPLEX_PRICE: Record<Stage, number> = { 1: 3990, 2: 4490, 3: 7990 };

export interface RoadmapStep {
  title: string;
  why: string;
  when: string;
  docs: string[];
}

export const ROADMAP: Record<Stage, RoadmapStep[]> = {
  1: [
    { title: "Не давайте объяснений без подготовки", why: "Первые слова инспектору часто решают квалификацию.", when: "Сразу", docs: [] },
    { title: "Свяжитесь с потерпевшим и возместите вред", why: "Возмещение — главный довод в пользу смягчения.", when: "Как можно раньше", docs: ["receipt"] },
    { title: "Получите заявление потерпевшего", why: "Позиция потерпевшего помогает перейти на ч. 1 ст. 12.27.", when: "После возмещения", docs: ["victim_requalify_gibdd"] },
    { title: "Ознакомьтесь с материалами в ГИБДД", why: "Узнайте, какие доказательства собраны.", when: "При первом визите", docs: ["gibdd_familiarize"] },
  ],
  2: [
    { title: "Подайте заявление об ознакомлении", why: "Сначала увидеть дело — потом давать объяснения.", when: "До визита или в день визита", docs: ["gibdd_familiarize"] },
    { title: "Заявите ходатайство о переквалификации", why: "Просим квалифицировать по ч. 1, где нет лишения прав.", when: "При составлении протокола", docs: ["requalify_gibdd"] },
    { title: "Подготовьтесь к суду", why: "Если нужно время — просите отложить заседание.", when: "После получения повестки", docs: ["postpone_court"] },
  ],
  3: [
    { title: "Изучите материалы дела в суде (за несколько дней до заседания)", why: "Без материалов невозможно выстроить защиту.", when: "До заседания", docs: ["court_familiarize"] },
    { title: "Проверьте сам факт ДТП", why: "Нет соприкосновения — нет ДТП и нет состава.", when: "До или в начале заседания", docs: ["trace_expertise", "terminate_court"] },
    { title: "Штраф вместо лишения", why: "Переквалификация или малозначительность сохраняют права.", when: "В заседании", docs: ["attach_court", "requalify_court", "art29_court"] },
    { title: "Подготовьте позицию и речь", why: "Письменные возражения и выступление закрепляют доводы.", when: "За 2–3 дня до суда", docs: ["objections_kit", "speech_kit"] },
  ],
};

/** Комплекс «под ключ» покрывает стадии от текущей до конца: 1 → 1,2,3; 2 → 2,3; 3 → 3. */
export function roadmapFrom(stage: Stage): { stage: Stage; steps: RoadmapStep[] }[] {
  return ([1, 2, 3] as Stage[]).filter((s) => s >= stage).map((s) => ({ stage: s, steps: ROADMAP[s] }));
}

export function complexDocs(stage: Stage): string[] {
  return Array.from(new Set(roadmapFrom(stage).flatMap((g) => g.steps.flatMap((s) => s.docs))));
}

export const rub = (n: number) => n.toLocaleString("ru-RU") + " ₽";
