type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { 0: SpeechRecognitionAlternative; isFinal: boolean };
type SpeechRecognitionResultList = { length: number; item(index: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult };

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = Event & {
  error?: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function supportsSpeechInput() {
  const target = window as SpeechWindow;
  return Boolean(target.SpeechRecognition || target.webkitSpeechRecognition);
}

export function startSpeechInput(options: {
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}) {
  const target = window as SpeechWindow;
  const Recognition = target.SpeechRecognition || target.webkitSpeechRecognition;
  if (!Recognition) {
    options.onError('当前浏览器不支持语音输入。生产环境建议接入语音转文字模型或服务。');
    options.onEnd();
    return undefined;
  }

  const recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = '';
    for (let i = 0; i < event.results.length; i += 1) {
      text += event.results[i][0]?.transcript ?? '';
    }
    if (text.trim()) options.onText(text.trim());
  };
  recognition.onerror = (event) => {
    options.onError(event.error ? `语音输入失败: ${event.error}` : '语音输入失败');
  };
  recognition.onend = options.onEnd;
  recognition.start();
  return recognition;
}
