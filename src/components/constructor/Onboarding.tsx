import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import evidenceImage from "@/assets/onboarding-evidence.jpg";
import stageImage from "@/assets/onboarding-stage.jpg";
import planImage from "@/assets/onboarding-plan.jpg";

const screens = [
  {
    title: "Подкрепите свою позицию документами",
    image: evidenceImage,
    alt: "Подтверждающие документы о работе, доходе и жилье рядом с весами правосудия",
    paragraphs: [
      "Представьте, что вы подаёте на визу. Вы говорите, что у вас есть работа, доход и квартира в России.\u00a0 Без предоставления подтверждающих документов визу вы не получите (даже, если это все правда). Решение принимает консульство.",
      "В деле об оставлении места ДТП принцип похожий. Защитная позиция должна быть оформлена документально и подкреплена к материалам. Без нее суд ограничиться формальной констатацией факта: когда ГИБДД прибыли на место вас не было. Значит виновны.",
    ],
    action: "Дальше",
  },
  {
    title: "Поймите, что делать на вашем этапе",
    image: stageImage,
    alt: "Последовательность этапов: ожидание вызова, ГИБДД, суд",
    paragraphs: [
      "Статьи в интернете помогают понять, как проходит дело. Когда пора действовать, возникают конкретные вопросы. Как получить копии материалов? Как запросить видеозапись? Что приложить к объяснениям и в какой момент необходимо их подать? Какие документы необходимо предоставить судье для того, чтобы у судьи не осталось формальной возможности лишить ВУ?",
      "Начните с того, где вы сейчас — ещё ждёте вызова, уже вызваны в ГИБДД или готовитесь к суду.",
    ],
    action: "Что я получу?",
  },
  {
    title: "Получите готовый план защиты и документы",
    image: planImage,
    alt: "Пошаговый план с отметками выполнения и комплект готовых документов",
    paragraphs: [
      "В полном комплекте — пошаговая стратегия защиты и документы для каждого этапа, от обращения в ГИБДД до рассмотрения дела в суде. Для каждого шага вы будете знать, что сделать, какой документ подать, куда и в какой момент.",
      "Если вам уже нужен конкретный документ, его можно подготовить отдельно.",
    ],
    action: "Выбрать мой этап",
  },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const screen = screens[step];

  useEffect(() => {
    if (step > 0) heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  if (!screen) return null;

  return (
    <div className="app-shell onboarding-shell min-h-svh">
      <header className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-4 sm:flex sm:justify-between sm:px-8 sm:py-5">
        <div className="min-w-0 leading-tight">
          <span className="block font-serif text-xl font-bold text-heading">Право Руля</span>
          <span className="text-xs text-muted-foreground">ст. 12.27 ч. 2 КоАП РФ</span>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground" aria-label={`Шаг ${step + 1} из 3`}>0{step + 1} / 03</span>
      </header>

      <main className="onboarding-main mx-auto flex min-h-[calc(100svh-5.5rem)] min-w-0 max-w-3xl flex-col px-4 pb-6 pt-4 sm:px-8 sm:pt-5">
        <div key={step} className="onboarding-enter flex min-h-0 flex-1 flex-col">
          <img
            src={screen.image}
            alt={screen.alt}
            width={1170}
            height={499}
            loading={step === 0 ? "eager" : "lazy"}
            className="onboarding-image mx-auto mb-4 h-[clamp(9rem,30svh,24rem)] w-full object-contain"
          />
          <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold leading-tight outline-none sm:text-4xl">
            {screen.title}
          </h1>
          <div className="onboarding-copy mt-4 space-y-3 text-base leading-relaxed sm:text-lg">
            {screen.paragraphs.map((paragraph, index) => (
              <p key={paragraph} className={index === 0 ? "text-muted-foreground" : "text-foreground"}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className="onboarding-actions mt-6 grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t border-border pt-4 sm:flex sm:justify-between sm:gap-4">
          {step > 0 ? (
            <Button variant="ghost" size="icon" aria-label="Назад" title="Назад" onClick={() => setStep(step - 1)}><ArrowLeft /></Button>
          ) : <span className="size-9" aria-hidden="true" />}
          <div className="onboarding-dots order-first col-span-2 flex justify-center gap-2 sm:order-none" aria-hidden="true">
            {screens.map((_, index) => <span key={index} className={`h-1.5 w-5 rounded-full ${index === step ? "bg-primary" : "bg-border"}`} />)}
          </div>
          <Button size="lg" className="min-h-12 justify-self-end" onClick={() => step < 2 ? setStep(step + 1) : onComplete()}>
            {screen.action}<ArrowRight />
          </Button>
        </div>
      </main>
    </div>
  );
}