import { Dispatch, SetStateAction, type FunctionComponent } from "react";
import { api } from "@/utils/api";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import Tabs from "../tabs";
import Loader from "../loader";

type ModalProps = {
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  roomName: string;
  visible: boolean;
  selectedCode: string;
};

const Modal: FunctionComponent<ModalProps> = ({
  setIsOpen,
  roomName,
  visible,
  selectedCode,
}) => {
  const { data, error, isLoading } = api.summary.getRoomSummary.useQuery({
    roomName,
  });
  console.log(data);

  return (
    <Transition appear show={visible} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-10"
        onClose={() => setIsOpen(false)}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-black p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-white"
                >
                  Meeting Summary
                </Dialog.Title>
                {isLoading ? (
                  <div className="mt-2">
                    <Loader />
                  </div>
                ) : error ? (
                  <div className="mt-2 text-red-500">
                    Error loading summary
                  </div>
                ) : data?.summary ? (
                  <div className="text-sm text-gray-100 text-opacity-50">
                    <Tabs
                      selectedCode={selectedCode}
                      summary={data.summary}
                      transcriptions={data.transcriptions || []}
                    />
                  </div>
                ) : (
                  <div className="mt-2 text-gray-400">
                    No summary available
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default Modal;
