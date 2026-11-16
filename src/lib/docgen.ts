import { AlignmentType, Document, Footer, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { DOCS, ROADMAP, type Stage } from "./catalog";

export interface FormData {
  fio: string; phone: string; email: string; address: string; birthYear: string;
  carNumber: string; accidentDate: string; accidentPlace: string; accidentTime: string;
  victim: string; gibddName: string; gibddAddress: string; courtName: string; courtAddress: string;
  passport: string;
}

export const emptyForm: FormData = {
  fio: "", phone: "", email: "", address: "", birthYear: "", carNumber: "", accidentDate: "",
  accidentPlace: "", accidentTime: "", victim: "", gibddName: "", gibddAddress: "", courtName: "",
  courtAddress: "", passport: "",
};

/** Демо-данные для удобства тестирования: подставляются, пока анкета пустая. */
export const demoForm: FormData = {
  fio: "Иванов Иван Иванович",
  phone: "+7 (900) 123-45-67",
  email: "ivanov@example.ru",
  address: "125009, г. Москва, ул. Тверская, д. 1, кв. 10",
  birthYear: "1985",
  carNumber: "А123БВ777",
  accidentDate: "2026-10-05",
  accidentPlace: "г. Москва, ул. Ленина, 5, парковка ТЦ",
  accidentTime: "18:30",
  victim: "Петров Пётр Петрович",
  gibddName: "ОГИБДД ОМВД России по району Арбат г. Москвы",
  gibddAddress: "119019, г. Москва, ул. Воздвиженка, д. 10",
  courtName: "Тверской районный суд г. Москвы",
  courtAddress: "125009, г. Москва, ул. Тверская, д. 7",
  passport: "4500 123456, выдан ОМВД России по району Арбат г. Москвы 10.03.2010",
};

/** Пустое поле не угадывается — остаётся явное место для ручного заполнения. */
export function v(value: string, placeholder: string): string {
  return value.trim() ? value.trim() : `[${placeholder}]`;
}

const fmtDate = (d: string) => (d ? d.split("-").reverse().join(".") : "");

function bodies(id: string, f: FormData): { title: string; paras: string[] } {
  const date = v(fmtDate(f.accidentDate), "ДАТА ДТП");
  const place = v(f.accidentPlace, "МЕСТО ДТП");
  const time = v(f.accidentTime, "ВРЕМЯ ДТП");
  const car = v(f.carNumber, "ГОСНОМЕР");
  const fact = `${date} около ${time} по адресу: ${place} произошло ДТП с участием автомобиля с г/н ${car}.`;
  const map: Record<string, { title: string; paras: string[] }> = {
    gibdd_familiarize: { title: "ЗАЯВЛЕНИЕ\nоб ознакомлении с материалами дела", paras: [fact, "В отношении меня проводится проверка по ч. 2 ст. 12.27 КоАП РФ.", "На основании ч. 1 ст. 25.1 КоАП РФ прошу предоставить мне возможность ознакомиться со всеми материалами дела, в том числе с правом фотографирования."] },
    receipt: { title: "РАСПИСКА\nв получении денежных средств", paras: [`Я, ________________________________ (ФИО потерпевшего), паспорт ____________________, получил(а) от ${v(f.fio, "ФИО")}, паспорт ${v(f.passport, "ПАСПОРТНЫЕ ДАННЫЕ")}, денежные средства в размере ____________ рублей в счёт компенсации морального и материального вреда, причинённого в результате ДТП ${date} по адресу: ${place}, с участием автомобиля г/н ${car} и автомобиля г/н ______________.`, "Претензий материального и морального характера не имею."] },
    victim_requalify_gibdd: { title: "ЗАЯВЛЕНИЕ\nпотерпевшего", paras: [fact, `Водитель ${v(f.fio, "ФИО")} полностью возместил причинённый вред, претензий не имею.`, "Прошу квалифицировать действия водителя по ч. 1 ст. 12.27 КоАП РФ."] },
    requalify_gibdd: { title: "ХОДАТАЙСТВО\nо переквалификации", paras: [fact, "Умысла на оставление места ДТП не имел.", "Прошу квалифицировать мои действия по ч. 1 ст. 12.27 КоАП РФ."] },
    postpone_court: { title: "ХОДАТАЙСТВО\nоб отложении судебного заседания", paras: ["В производстве суда находится дело об административном правонарушении по ч. 2 ст. 12.27 КоАП РФ в отношении меня.", "Для реализации права на защиту мне необходимо время для ознакомления с материалами дела.", "Прошу отложить рассмотрение дела."] },
    art29_court: { title: "ХОДАТАЙСТВО\nо применении ст. 2.9 КоАП РФ", paras: [fact, "Совершённое деяние не повлекло существенного нарушения охраняемых общественных отношений.", "Прошу освободить меня от административной ответственности в связи с малозначительностью и ограничиться устным замечанием."] },
    requalify_court: { title: "ХОДАТАЙСТВО\nо переквалификации", paras: [fact, "Прошу переквалифицировать мои действия с ч. 2 на ч. 1 ст. 12.27 КоАП РФ."] },
    terminate_court: { title: "ХОДАТАЙСТВО\nо прекращении производства по делу", paras: [fact, "Материалы дела не подтверждают наличие состава административного правонарушения.", "На основании п. 2 ч. 1 ст. 24.5 КоАП РФ прошу прекратить производство по делу."] },
    trace_expertise: { title: "ХОДАТАЙСТВО\nо назначении трасологической экспертизы", paras: [fact, "Факт контактного взаимодействия транспортных средств вызывает сомнения.", "Прошу назначить судебную трасологическую экспертизу."] },
    court_familiarize: { title: "ЗАЯВЛЕНИЕ\nоб ознакомлении с материалами дела", paras: ["В производстве суда находится дело по ч. 2 ст. 12.27 КоАП РФ в отношении меня.", "На основании ч. 1 ст. 25.1 КоАП РФ прошу ознакомить меня с материалами дела с правом фотосъёмки."] },
    objections_kit: { title: "КОМПЛЕКТ\nдля письменных возражений", paras: ["Образцы возражений, библиотека формулировок и пояснительная записка.", "[МАТЕРИАЛЫ КОМПЛЕКТА БУДУТ ПРЕДОСТАВЛЕНЫ ВЛАДЕЛЬЦЕМ ПРОЕКТА]"] },
    speech_kit: { title: "КОМПЛЕКТ\nдля выступления в суде", paras: ["Образцы судебных речей и ключевые принципы подготовки выступления.", "[МАТЕРИАЛЫ КОМПЛЕКТА БУДУТ ПРЕДОСТАВЛЕНЫ ВЛАДЕЛЬЦЕМ ПРОЕКТА]"] },
  };
  return map[id]!;
}

const run = (text: string, bold = false) => new TextRun({ text, bold, font: "Times New Roman", size: 24 });

function headerLines(id: string, f: FormData): string[] {
  const a = DOCS[id]!.addressee;
  const lines: string[] = [];
  if (a === "gibdd") lines.push(`В ${v(f.gibddName, "НАИМЕНОВАНИЕ ПОДРАЗДЕЛЕНИЯ ГИБДД")}`, v(f.gibddAddress, "АДРЕС ГИБДД"));
  if (a === "court") lines.push(`В ${v(f.courtName, "НАИМЕНОВАНИЕ СУДА")}`, v(f.courtAddress, "АДРЕС СУДА"));
  if (a === "none") return [];
  lines.push(`от ${v(f.fio, "ФИО")}`, `${v(f.birthYear, "ГОД РОЖДЕНИЯ")} г.р.`, `адрес: ${v(f.address, "АДРЕС")}`, `тел.: ${v(f.phone, "ТЕЛЕФОН")}`, `email: ${v(f.email, "EMAIL")}`);
  return lines;
}

function header(id: string, f: FormData): Paragraph[] {
  return headerLines(id, f).map((t) => new Paragraph({ indent: { left: 5000 }, alignment: AlignmentType.LEFT, children: [run(t)] }));
}

function build(children: Paragraph[]) {
  return new Document({
    sections: [{
      properties: {},
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: "Times New Roman", size: 24 })] })] }) },
      children,
    }],
  });
}

export function buildDoc(id: string, f: FormData) {
  const b = bodies(id, f);
  return build([
    ...header(id, f),
    new Paragraph({ text: "" }),
    ...b.title.split("\n").map((t) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(t, true)] })),
    new Paragraph({ text: "" }),
    ...b.paras.map((t) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 709 }, children: [run(t)] })),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [run(`«___» __________ 20__ г.            ____________ / ${v(f.fio, "ФИО")}`)] }),
  ]);
}

export function buildInstruction(stage: Stage, f: FormData) {
  const ps: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run("ПИСЬМЕННАЯ ИНСТРУКЦИЯ", true)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`для ${v(f.fio, "ФИО")}`)] }),
    new Paragraph({ text: "" }),
  ];
  ROADMAP[stage].forEach((s, i) => {
    ps.push(new Paragraph({ children: [run(`Шаг ${i + 1}. ${s.title}`, true)] }));
    ps.push(new Paragraph({ children: [run(`${s.why} Когда: ${s.when.toLowerCase()}.`)] }));
    s.docs.forEach((d) => {
      const doc = DOCS[d]!;
      const to = doc.addressee === "gibdd" ? v(f.gibddName, "ПОДРАЗДЕЛЕНИЕ ГИБДД") : doc.addressee === "court" ? v(f.courtName, "СУД") : "передаётся потерпевшему";
      ps.push(new Paragraph({ indent: { left: 400 }, children: [run(`— ${doc.title}. Адресат: ${to}. Подача: лично под отметку о принятии на втором экземпляре или почтой с описью.`)] }));
    });
    ps.push(new Paragraph({ text: "" }));
  });
  return build(ps);
}

export async function download(doc: Document, name: string) {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name.replace(/[^\p{L}\p{N} ._-]/gu, "") + ".docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (name: string, ext: string) => name.replace(/[^\p{L}\p{N} ._-]/gu, "") + ext;

/** PDF с тем же содержимым, что и DOCX (шрифт с кириллицей из /fonts). */
export async function downloadPdf(id: string, f: FormData, name: string) {
  const [{ PDFDocument, rgb }, fontkit] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit").then((m) => m.default)]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [r, b] = await Promise.all(["/fonts/LiberationSerif-Regular.ttf", "/fonts/LiberationSerif-Bold.ttf"].map((u) => fetch(u).then((x) => x.arrayBuffer())));
  const reg = await pdf.embedFont(r!, { subset: true });
  const bold = await pdf.embedFont(b!, { subset: true });
  const size = 12, lh = 17, W = 595, H = 842, L = 85, R = 42, T = 57, B = 57, maxW = W - L - R;
  let page = pdf.addPage([W, H]);
  let y = H - T;
  const nl = () => { if (y < B) { page = pdf.addPage([W, H]); y = H - T; } };
  const wrap = (t: string, font: typeof reg, w: number) => {
    const out: string[] = []; let line = "";
    for (const word of t.split(" ")) {
      const test = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(test, size) > w && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line); return out;
  };
  const draw = (t: string, x: number, font = reg) => { nl(); page.drawText(t, { x, y, size, font, color: rgb(0, 0, 0) }); y -= lh; };
  for (const h of headerLines(id, f)) for (const l of wrap(h, reg, maxW - 250)) draw(l, L + 250);
  y -= lh;
  const bd = bodies(id, f);
  for (const t of bd.title.split("\n")) draw(t, L + (maxW - bold.widthOfTextAtSize(t, size)) / 2, bold);
  y -= lh;
  for (const p of bd.paras) wrap(p, reg, maxW - 35).forEach((l, i) => draw(l, i === 0 ? L + 35 : L));
  y -= lh;
  draw(`«___» __________ 20__ г.        ____________ / ${v(f.fio, "ФИО")}`, L);
  pdf.getPages().forEach((pg, i) => { const n = String(i + 1); pg.drawText(n, { x: W / 2 - reg.widthOfTextAtSize(n, 10) / 2, y: 30, size: 10, font: reg }); });
  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = fileName(name, ".pdf"); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
