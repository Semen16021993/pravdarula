import { useEffect, useState } from "react";
import { ArrowLeft, Check, Download, FileText, Lock, Map, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  COMPLEX_PRICE, DOCS, ROADMAP, STAGES, cartTotal, complexDocs, docsForStage, isRecommended, rub,
  type Mode, type Stage,
} from "@/lib/catalog";
import { buildDoc, buildInstruction, download, emptyForm, type FormData } from "@/lib/docgen";

type Step = "mode" | "stage" | "form" | "offer" | "paid";
type OrderStatus = "draft" | "pending" | "paid" | "failed";

interface State {
  step: Step; mode: Mode | null; stage: Stage | null; hasMaterials: boolean | null;
  form: FormData; consent: boolean; cart: string[]; status: OrderStatus; purchased: string[];
}
const initial: State = { step: "mode", mode: null, stage: null, hasMaterials: null, form: emptyForm, consent: false, cart: [], status: "draft", purchased: [] };
const KEY = "pravo-rulya-order";

function formatPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  let out = "+7";
  if (p[0]) out += ` (${p[0]}`;
  if (p[0]!.length === 3) out += ")";
  if (p[1]) out += ` ${p[1]}`;
  if (p[2]) out += `-${p[2]}`;
  if (p[3]) out += `-${p[3]}`;
  return raw.trim() === "" ? "" : out;
}

export function Constructor() {
  const [s, setS] = useState<State>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setS({ ...initial, ...JSON.parse(raw) }); } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(s)); }, [s, loaded]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [s.step]);

  const set = (p: Partial<State>) => setS((x) => ({ ...x, ...p }));
  const reset = () => setS(initial);

  const steps: Step[] = ["mode", "stage", "form", "offer", "paid"];
  const idx = steps.indexOf(s.step);
  const back = () => idx > 0 && s.step !== "paid" && set({ step: steps[idx - 1]! });

  return (
    <div className="min-h-screen">
      <header className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-3xl bg-card px-6 py-4 shadow-soft">
        <button onClick={reset} className="text-left leading-none">
          <span className="block font-serif text-lg font-bold text-heading">Право Руля</span>
          <span className="text-xs text-muted-foreground">конструктор документов · ст. 12.27 ч. 2</span>
        </button>
        <Button asChild size="sm"><a href="tel:+79105086284">8 910 508 6284</a></Button>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {s.step !== "mode" && (
          <div className="mb-6 flex items-center gap-4">
            {s.step !== "paid" && <Button variant="ghost" size="sm" onClick={back}><ArrowLeft /> Назад</Button>}
            <div className="flex flex-1 gap-2">
              {["Режим", "Стадия", "Анкета", s.mode === "complex" ? "Roadmap" : "Документы", "Готово"].map((l, i) => (
                <div key={l} className="flex-1">
                  <div className={`h-1.5 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`} />
                  <span className="mt-1 hidden text-xs text-muted-foreground sm:block">{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {s.step === "mode" && <ModeStep onPick={(mode) => set({ mode, step: "stage" })} />}
        {s.step === "stage" && <StageStep s={s} set={set} />}
        {s.step === "form" && <FormStep s={s} set={set} />}
        {s.step === "offer" && s.mode === "single" && <CatalogStep s={s} set={set} />}
        {s.step === "offer" && s.mode === "complex" && <ComplexStep s={s} set={set} />}
        {s.step === "paid" && <PaidStep s={s} onReset={reset} />}
      </main>
    </div>
  );
}

type P = { s: State; set: (p: Partial<State>) => void };

function ModeStep({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <section>
      <h1 className="max-w-none whitespace-nowrap text-3xl font-bold leading-tight md:text-5xl">Документы для ГИБДД и суда</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Для водителей, которым грозит ч. 2 ст. 12.27 КоАП РФ. Выберите стадию, заполните анкету один раз — получите готовые документы с вашими данными, соответствующие стадии дела и инстанции рассмотрения.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="panel flex flex-col">
          <FileText className="size-9 text-primary" />
          <h2 className="mt-4 text-2xl font-bold">Отдельные документы</h2>
          <p className="mt-2 text-muted-foreground">Если вы юрист или хорошо разбираетесь в вопросах КоАП - выберите нужные документы своей стадии, отправьте в корзину и оплатите одним платежом.</p>
          <p className="mt-3 text-sm text-muted-foreground">Roadmap и письменная инструкция <b>не входят</b>.</p>
          <p className="mt-4 font-bold text-heading">от 790 ₽ за документ</p>
          <Button className="mt-6" size="lg" variant="outline" onClick={() => onPick("single")}>Выбрать документы</Button>
        </div>
        <div className="panel flex flex-col border-primary bg-secondary">
          <div className="flex items-start justify-between"><Map className="size-9 text-primary" /><span className="chip">Всё вместе</span></div>
          <h2 className="mt-4 text-2xl font-bold">Комплексное сопровождение</h2>
          <p className="mt-2 text-muted-foreground">Персональный Roadmap по шагам, весь комплект документов к каждому шагу и письменная инструкция: когда, куда и как подавать.</p>
          <p className="mt-3 text-sm text-muted-foreground">Оплачивается <b>одной суммой</b>.</p>
          <p className="mt-4 font-bold text-heading">от {rub(COMPLEX_PRICE[1])} за комплекс</p>
          <Button className="mt-6" size="lg" onClick={() => onPick("complex")}>Собрать комплекс</Button>
        </div>
      </div>
    </section>
  );
}

function StageStep({ s, set }: P) {
  return (
    <section className="max-w-3xl">
      <h1 className="text-3xl font-bold md:text-4xl">Где вы сейчас?</h1>
      <p className="mt-2 text-muted-foreground">От стадии зависит, какие документы вам пригодятся.</p>
      <div className="mt-6 space-y-3">
        {STAGES.map((st) => (
          <button key={st.id} className="choice" data-active={s.stage === st.id} onClick={() => set({ stage: st.id, hasMaterials: st.id === 3 ? s.hasMaterials : null })}>
            <span className="text-xs font-bold uppercase tracking-wide text-primary">Стадия {st.id}</span>
            <span className="mt-1 block text-lg font-bold text-heading">{st.text}</span>
          </button>
        ))}
      </div>
      {s.stage === 3 && (
        <div className="panel mt-6">
          <p className="font-bold text-heading">У вас есть материалы административного дела?</p>
          <div className="mt-3 flex gap-3">
            {[["Да", true], ["Нет", false]].map(([l, val]) => (
              <Button key={String(l)} variant={s.hasMaterials === val ? "default" : "outline"} onClick={() => set({ hasMaterials: val as boolean })}>{l as string}</Button>
            ))}
          </div>
        </div>
      )}
      <Button className="mt-8" size="lg" disabled={!s.stage || (s.stage === 3 && s.hasMaterials === null)} onClick={() => set({ step: "form" })}>Дальше — анкета</Button>
    </section>
  );
}

function Field({ id, label, hint, value, onChange, type = "text", placeholder }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={id} className="font-bold text-heading">{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1.5 bg-background" />
      <p className="field-hint">{hint}</p>
    </div>
  );
}

function FormStep({ s, set }: P) {
  const f = s.form;
  const up = (k: keyof FormData) => (val: string) => set({ form: { ...f, [k]: val } });
  const needPassport = s.stage === 1;
  return (
    <section className="max-w-3xl">
      <h1 className="text-3xl font-bold md:text-4xl">Анкета</h1>
      <p className="mt-2 text-muted-foreground">Не знаете ответ — оставьте поле пустым. В документе останется место, чтобы вписать от руки.</p>

      <div className="panel mt-6">
        <h2 className="text-xl font-bold">О вас</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Field id="fio" label="ФИО" hint="Полностью, как в паспорте." value={f.fio} onChange={up("fio")} />
          <Field id="phone" label="Телефон" hint="Российский номер." placeholder="+7 (___) ___-__-__" value={f.phone} onChange={(x) => up("phone")(formatPhone(x))} type="tel" />
          <Field id="email" label="Электронная почта" hint="Сюда придут документы." type="email" value={f.email} onChange={up("email")} />
          <Field id="birthYear" label="Год рождения" hint="Четыре цифры, например 1985." value={f.birthYear} onChange={(x) => up("birthYear")(x.replace(/\D/g, "").slice(0, 4))} />
          <div className="md:col-span-2"><Field id="address" label="Фактический адрес" hint="Где вы живёте сейчас, с индексом." value={f.address} onChange={up("address")} /></div>
          <Field id="carNumber" label="Госномер вашего автомобиля" hint="Например, А123ВС77." value={f.carNumber} onChange={(x) => up("carNumber")(x.toUpperCase())} />
          {needPassport && <Field id="passport" label="Паспорт (для расписки)" hint="Серия, номер, кем и когда выдан. Нужно только для расписки." value={f.passport} onChange={up("passport")} />}
        </div>
      </div>

      <div className="panel mt-6">
        <h2 className="text-xl font-bold">О ДТП</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Field id="accidentDate" label="Дата ДТП" hint="Выберите дату." type="date" value={f.accidentDate} onChange={up("accidentDate")} />
          <Field id="accidentTime" label="Примерное время" hint="Можно примерно: «около 18:30»." value={f.accidentTime} onChange={up("accidentTime")} />
          <div className="md:col-span-2"><Field id="accidentPlace" label="Место ДТП" hint="Адрес или описание: «парковка ТЦ, ул. Ленина, 5»." value={f.accidentPlace} onChange={up("accidentPlace")} /></div>
          <div className="md:col-span-2"><Field id="victim" label="Потерпевший" hint="ФИО или только фамилия — этого достаточно." value={f.victim} onChange={up("victim")} /></div>
        </div>
      </div>

      <div className="panel mt-6">
        <h2 className="text-xl font-bold">Куда подавать</h2>
        <p className="mt-1 text-sm text-muted-foreground">Найдите подразделение ГИБДД и суд в интернете. Мы не подставляем адреса сами.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Field id="gibddName" label="Подразделение ГИБДД" hint="Например: ОБ ДПС ГИБДД УМВД по г. Иваново." value={f.gibddName} onChange={up("gibddName")} />
          <Field id="gibddAddress" label="Адрес ГИБДД" hint="Индекс, город, улица, дом." placeholder="153000, г. Иваново, ул. ..., д. ..." value={f.gibddAddress} onChange={up("gibddAddress")} />
          <Field id="courtName" label="Суд" hint="Если не знаете — оставьте пустым." value={f.courtName} onChange={up("courtName")} />
          <Field id="courtAddress" label="Адрес суда" hint="Если не знаете — оставьте пустым." value={f.courtAddress} onChange={up("courtAddress")} />
        </div>
      </div>

      <label className="mt-6 flex items-start gap-3 text-sm">
        <Checkbox checked={s.consent} onCheckedChange={(c) => set({ consent: c === true })} className="mt-0.5" />
        <span>Даю <a className="text-primary underline" href="#" onClick={(e) => e.preventDefault()}>согласие на обработку персональных данных</a> и принимаю <a className="text-primary underline" href="#" onClick={(e) => e.preventDefault()}>политику обработки</a>.</span>
      </label>
      <Button className="mt-6" size="lg" disabled={!s.consent} onClick={() => set({ step: "offer" })}>
        {s.mode === "complex" ? "Построить Roadmap" : "Показать документы"}
      </Button>
    </section>
  );
}

function PayBox({ total, items, s, set }: P & { total: number; items: string[] }) {
  const pay = (ok: boolean) => {
    set({ status: "pending" });
    setTimeout(() => set(ok ? { status: "paid", purchased: items, step: "paid" } : { status: "failed" }), 900);
  };
  return (
    <div className="panel lg:sticky lg:top-6">
      <p className="text-sm text-muted-foreground">К оплате</p>
      <p className="font-serif text-4xl font-bold text-heading">{rub(total)}</p>
      {s.status === "failed" && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Оплата не подтверждена — доступ не открыт. Попробуйте ещё раз.</p>}
      <Button className="mt-5 w-full" size="lg" disabled={!items.length || s.status === "pending"} onClick={() => pay(true)}>
        {s.status === "pending" ? "Ожидаем оплату…" : "Оплатить"}
      </Button>
      <button className="mt-3 w-full text-xs text-muted-foreground underline" onClick={() => pay(false)}>Тест: смоделировать ошибку оплаты</button>
      <p className="mt-3 text-xs text-muted-foreground">Демо-оплата: платёжная система ещё не подключена.</p>
    </div>
  );
}

function CatalogStep({ s, set }: P) {
  const stage = s.stage!;
  const toggle = (id: string) => set({ cart: s.cart.includes(id) ? s.cart.filter((x) => x !== id) : [...s.cart, id], status: "draft" });
  return (
    <section>
      <h1 className="text-3xl font-bold md:text-4xl">Документы для стадии {stage}</h1>
      <p className="mt-2 text-muted-foreground">Выберите один или несколько — оплата одним платежом.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {docsForStage(stage).map((d) => {
            const inCart = s.cart.includes(d.id);
            const rec = isRecommended(stage, d.id, s.hasMaterials);
            return (
              <div key={d.id} className={`panel flex flex-col gap-4 md:flex-row md:items-center ${rec ? "border-2 border-accent" : ""}`}>
                <div className="flex-1">
                  <div className="flex flex-wrap gap-2">
                    {rec && <span className="chip-accent">Рекомендуем: у вас нет материалов дела</span>}
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{d.kind === "kit" ? "Комплект образцов" : "DOCX с вашими данными"}</span>
                  </div>
                  <h3 className="mt-1 text-lg font-bold">{d.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{d.purpose}</p>
                </div>
                <div className="flex items-center gap-4 md:flex-col md:items-end">
                  <span className="text-xl font-bold text-heading">{rub(d.price)}</span>
                  <Button variant={inCart ? "secondary" : "default"} onClick={() => toggle(d.id)}>
                    {inCart ? <><Check /> В корзине</> : <><ShoppingCart /> В корзину</>}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="panel mb-4">
            <h3 className="text-lg font-bold">Корзина</h3>
            {s.cart.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Пока пусто.</p> : (
              <ul className="mt-3 space-y-2 text-sm">
                {s.cart.map((id) => (
                  <li key={id} className="flex items-start justify-between gap-2">
                    <span>{DOCS[id]!.title}</span>
                    <button aria-label="Убрать" onClick={() => toggle(id)}><X className="size-4 text-muted-foreground" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <PayBox s={s} set={set} total={cartTotal(s.cart)} items={s.cart} />
        </div>
      </div>
    </section>
  );
}

function RoadmapView({ stage, locked, onDoc }: { stage: Stage; locked: boolean; onDoc?: (id: string) => void }) {
  return (
    <ol className="relative space-y-6 border-l-2 border-primary/30 pl-8">
      {ROADMAP[stage].map((st, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[3.05rem] flex size-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
          <div className="panel">
            <span className="text-xs font-bold uppercase tracking-wide text-primary">{st.when}</span>
            <h3 className="mt-1 text-xl font-bold">{st.title}</h3>
            <p className="mt-1 text-muted-foreground">{st.why}</p>
            {st.docs.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {st.docs.map((d) => (
                  <button key={d} disabled={locked} onClick={() => onDoc?.(d)} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm hover:border-primary disabled:cursor-default">
                    {locked ? <Lock className="size-3.5" /> : <Download className="size-3.5 text-primary" />} {DOCS[d]!.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ComplexStep({ s, set }: P) {
  const stage = s.stage!;
  const items = complexDocs(stage);
  const sum = cartTotal(items);
  return (
    <section>
      <h1 className="text-3xl font-bold md:text-4xl">Ваш Roadmap — стадия {stage}</h1>
      <p className="mt-2 text-muted-foreground">Документы откроются после оплаты комплекса.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <RoadmapView stage={stage} locked />
        <div>
          <div className="panel mb-4">
            <h3 className="text-lg font-bold">В комплекс входит</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" /> Персональный Roadmap</li>
              <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" /> {items.length} документов с вашими данными</li>
              <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" /> Письменная инструкция: когда, куда и как подать</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">По отдельности документы стоили бы {rub(sum)}.</p>
          </div>
          <PayBox s={s} set={set} total={COMPLEX_PRICE[stage]} items={items} />
        </div>
      </div>
    </section>
  );
}

function PaidStep({ s, onReset }: { s: State; onReset: () => void }) {
  const get = (id: string) => download(buildDoc(id, s.form), DOCS[id]!.title);
  return (
    <section>
      <span className="chip">Оплачено · документы доступны</span>
      <h1 className="mt-3 text-3xl font-bold md:text-4xl">Ваши документы готовы</h1>
      <p className="mt-2 text-muted-foreground">Поля в квадратных скобках заполните от руки перед подачей.</p>

      {s.mode === "complex" ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <RoadmapView stage={s.stage!} locked={false} onDoc={get} />
          <div className="panel h-fit">
            <h3 className="text-lg font-bold">Письменная инструкция</h3>
            <p className="mt-1 text-sm text-muted-foreground">Порядок действий, адресаты и способы подачи.</p>
            <Button className="mt-4 w-full" onClick={() => download(buildInstruction(s.stage!, s.form), "Инструкция Право Руля")}><Download /> Скачать инструкцию</Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {s.purchased.map((id) => (
            <div key={id} className="panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-bold">{DOCS[id]!.title}</h3>
              <Button onClick={() => get(id)}><Download /> DOCX</Button>
            </div>
          ))}
        </div>
      )}

      <div className="panel mt-10 border-primary bg-secondary">
        <h2 className="text-2xl font-bold">Не получилось разобраться или нужен документ под вашу ситуацию?</h2>
        <p className="mt-2 text-muted-foreground">Свяжитесь с «Право Руля» — мы поможем разобраться и подготовить необходимые документы. Индивидуальная помощь оплачивается отдельно.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild size="lg"><a href="https://12-27.ru/contacts" target="_blank" rel="noreferrer">Связаться с юристом</a></Button>
          <Button size="lg" variant="outline" onClick={onReset}>Начать заново</Button>
        </div>
      </div>
    </section>
  );
}
