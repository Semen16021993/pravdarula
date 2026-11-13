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
  return map[id];
}

const run = (text: string, bold = false) => new TextRun({ text, bold, font: "Times New Roman", size: 24 });

function header(id: string, f: FormData): Paragraph[] {
  const a = DOCS[id].addressee;
  const lines: string[] = [];
  if (a === "gibdd") lines.push(`В ${v(f.gibddName, "НАИМЕНОВАНИЕ ПОДРАЗДЕЛЕНИЯ ГИБДД")}`, v(f.gibddAddress, "АДРЕС ГИБДД"));
  if (a === "court") lines.push(`В ${v(f.courtName, "НАИМЕНОВАНИЕ СУДА")}`, v(f.courtAddress, "АДРЕС СУДА"));
  if (a === "none") return [];
  lines.push(`от ${v(f.fio, "ФИО")}`, `${v(f.birthYear, "ГОД РОЖДЕНИЯ")} г.р.`, `адрес: ${v(f.address, "АДРЕС")}`, `тел.: ${v(f.phone, "ТЕЛЕФОН")}`, `email: ${v(f.email, "EMAIL")}`);
  return lines.map((t) => new Paragraph({ indent: { left: 5000 }, alignment: AlignmentType.LEFT, children: [run(t)] }));
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
      const doc = DOCS[d];
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
