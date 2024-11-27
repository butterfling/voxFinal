import { Tab } from "@headlessui/react";
import { setCORS } from "google-translate-api-browser";
import { useEffect, useState } from "react";
const translate = setCORS("https://cors-proxy.fringe.zone/");

function classNames(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Tabs({
  summary,
  transcriptions,
  selectedCode,
}: {
  summary: string;
  transcriptions: string[];
  selectedCode: string;
}) {
  const [translatedSummary, setTranslatedSummary] = useState<string>("");

  async function translateText(text: string) {
    console.log("inside translate");

    const res = await translate(text, {
      //@ts-ignore
      to: selectedCode.split("-")[0],
    });

    return res.text;
  }

  useEffect(() => {
    async function translateSummary() {
      const translatedSummary = await translateText(summary);
      setTranslatedSummary(translatedSummary);
    }

    if (selectedCode !== "en") {
      translateSummary();
    }
  }, [selectedCode]);

  return (
    <div className="w-full max-w-md px-2 py-16 sm:px-0">
      <Tab.Group>
        <Tab.List className="flex rounded-xl bg-gray-900/60 p-1">
          <Tab
            className={({ selected }) =>
              classNames(
                "w-full rounded-lg py-2.5 text-sm font-medium leading-5 ",
                " ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2",
                selected
                  ? "bg-secondary/10 shadow"
                  : "text-blue-100 hover:bg-white/[0.12] hover:text-white"
              )
            }
          >
            Summary
          </Tab>
        </Tab.List>
        <Tab.Panels className="mt-2">
          <Tab.Panel>
            <p className="p-5 text-lg text-white">
              {translatedSummary ? translatedSummary : summary}
            </p>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
