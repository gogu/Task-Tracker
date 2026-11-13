import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Wand2,
} from 'lucide-react';
import {
  NpcConfig,
  NpcExpression,
  NpcPreset,
  EXPRESSION_META,
  DEFAULT_NPC_CONFIG,
  NPC_PRESETS,
} from '../utils/guildNpc';

interface NpcConfigModalProps {
  isOpen: boolean;
  config: NpcConfig;
  onClose: () => void;
  onSave: (next: NpcConfig) => void;
  onReset: () => void;
}

const EXPRESSION_ORDER: NpcExpression[] = ['normal', 'happy', 'cheer', 'thinking', 'sleepy'];

const AI_PROMPT_TEMPLATES = {
  characterBase:
    "Anime visual novel character sprite, waist-up portrait of [在此填写角色外貌/发型发色/瞳色/服装设定], character's waist and lower torso flush with the very bottom edge of the canvas, generous headroom above head and hair accessories, facing viewer, masterpiece anime cel-shaded art style, crisp clean dark outlines, vibrant colors, isolated on a pure flat solid chroma key green screen background (#00FF00) for easy alpha extraction, no green lighting spill on character, no background scenery, no text, no watermark",
  backgroundBase:
    '16:9 widescreen anime visual novel background art, [在此填写场景主题，如：温暖奇幻冒险者公会大厅 / 赛博朋克霓虹清吧 / 樱花神社庭院茶屋], rich atmospheric lighting, cinematic depth, open central composition suitable for character sprite overlay, masterpiece background illustration, no people, no characters, no text, no watermark',
};

const EXPRESSION_PROMPT_SUFFIXES: Record<NpcExpression, { shortCn: string; prompt: string }> = {
  normal: {
    shortCn: '日常接待（微笑待命）',
    prompt:
      'gentle welcoming smile, one hand politely resting near chest or holding a guild ledger, calm and composed receptionist posture',
  },
  happy: {
    shortCn: '开心愉悦（打卡赞许）',
    prompt:
      'bright cheerful beaming smile, lively eyes, making a friendly peace sign or waving hand near shoulder, joyful energetic vibe',
  },
  cheer: {
    shortCn: '庆典喝彩（达成欢呼）',
    prompt:
      'excited celebratory expression, sparkling eyes, both hands clasped together or raising a toast in congratulation, proud energetic aura',
  },
  thinking: {
    shortCn: '认真思索（抽签出谋）',
    prompt:
      'thoughtful analytical expression, one finger gently touching chin/cheek, slightly tilted head, focused attentive gaze',
  },
  sleepy: {
    shortCn: '困倦小憩（深夜催更）',
    prompt:
      'drowsy sleepy expression, half-closed eyes, gently stifling a cute yawn with one hand, relaxed cozy late-night mood',
  },
};

const PRESET_PROMPTS = [
  {
    id: 'fantasy_guild',
    title: '🏰 奇幻冒险者公会 · 艾莉丝（Alice）',
    spritePrompt:
      "Anime visual novel character sprite, waist-up portrait of a cheerful anime girl adventurer guild receptionist with long honey-blonde hair in a half-up ponytail, warm emerald green eyes, wearing a medieval fantasy guild uniform with burgundy velvet capelet, cream ruffled blouse, brass guild crest brooch, and brown leather belt, character's waist and lower torso flush with the very bottom edge of the canvas, generous headroom above head, crisp clean dark outlines, vibrant anime cel-shaded style, isolated on a pure flat solid chroma key green screen background (#00FF00), no green lighting spill on character, no background scenery, no text, no watermark",
    bgPrompt:
      '16:9 widescreen anime visual novel background art, cozy warm fantasy adventurer guild reception hall interior, grand oak wood counter on sides, glowing hearth fireplace, parchment quest board with pinned maps on stone walls, golden lantern ambient light rays, open central space for character sprite overlay, masterpiece anime background illustration, no people, no characters, no text, no watermark',
  },
  {
    id: 'cyber_tavern',
    title: '🍸 赛博霓虹酒馆 · 琳恩·V（Lynn V）',
    spritePrompt:
      "Anime visual novel character sprite, waist-up portrait of a stylish cyberpunk anime girl bartender with short silver-white bob hair and hot-pink inner highlights, glowing violet eyes, wearing sleek neon cat-ear headphones and a cropped futuristic black leather tech-jacket with magenta LED trim, character's waist and lower torso flush with the very bottom edge of the canvas, generous headroom above cat ears, crisp clean dark outlines, vibrant anime cel-shaded style, isolated on a pure flat solid chroma key green screen background (#00FF00), no green lighting spill on character, no background scenery, no text, no watermark",
    bgPrompt:
      '16:9 widescreen anime visual novel background art, atmospheric cyberpunk neon cyber-cafe and night bar interior, retro arcade cabinets on left, rain-streaked glass windows overlooking glowing futuristic skyline, cyan and magenta neon signs, open central space for character sprite overlay, masterpiece anime background illustration, no people, no characters, no text, no watermark',
  },
  {
    id: 'sakura_shrine',
    title: '🌸 樱花神社茶屋 · 白川朔夜（Sakuya）',
    spritePrompt:
      "Anime visual novel character sprite, waist-up portrait of an elegant Japanese shrine maiden receptionist with long silky raven-black hair in a high ponytail tied with a scarlet silk ribbon, gentle golden-amber eyes, wearing traditional white kosode top and vermilion hakama over shoulder with subtle gold floral embroidery, character's waist and lower torso flush with the very bottom edge of the canvas, generous headroom above head, crisp clean dark outlines, vibrant anime cel-shaded style, isolated on a pure flat solid chroma key green screen background (#00FF00), no green lighting spill on character, no background scenery, no text, no watermark",
    bgPrompt:
      '16:9 widescreen anime visual novel background art, serene Japanese sakura shrine tea pavilion interior bathed in golden afternoon sunlight, open shoji wooden veranda framing blooming pink cherry blossom trees outside, warm wooden pillars and paper lanterns, tranquil drifting sakura petals, open central composition for character sprite overlay, masterpiece anime background illustration, no people, no characters, no text, no watermark',
  },
] as const;

/**
 * Extracts transparent alpha from a chroma-key green screen background (#00FF00) via
 * 4-edge BFS flood-fill + enclosed neon-green gap removal + boundary despill & feathering.
 */
function removeGreenScreenFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  if (width <= 0 || height <= 0) return;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Skip if all 4 corners are already transparent (already processed PNG)
  const cornerIndices = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  if (cornerIndices.every((idx) => data[idx + 3] < 16)) {
    return;
  }

  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);

  const isChromaGreen = (pixelIdx: number): boolean => {
    const p = pixelIdx * 4;
    const a = data[p + 3];
    if (a < 16) return true;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const maxRB = Math.max(r, b);
    return g >= 65 && g - maxRB >= 20 && g > r * 1.15 && g > b * 1.15;
  };

  const isEnclosedSeed = (pixelIdx: number): boolean => {
    const p = pixelIdx * 4;
    const a = data[p + 3];
    if (a < 16) return false;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const maxRB = Math.max(r, b);
    return g >= 115 && g - maxRB >= 42 && g > r * 1.32 && g > b * 1.32;
  };

  const floodFromSeed = (seedIdx: number) => {
    if (visited[seedIdx]) return;
    let head = 0;
    let tail = 0;
    visited[seedIdx] = 1;
    queue[tail++] = seedIdx;

    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % width;
      const cy = (cur - cx) / width;

      const neighbors = [
        cx > 0 ? cur - 1 : -1,
        cx + 1 < width ? cur + 1 : -1,
        cy > 0 ? cur - width : -1,
        cy + 1 < height ? cur + width : -1,
      ];
      for (let k = 0; k < 4; k++) {
        const nIdx = neighbors[k];
        if (nIdx >= 0 && !visited[nIdx] && isChromaGreen(nIdx)) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }
  };

  // 1. Seed all 4 outer edges
  for (let x = 0; x < width; x++) {
    const top = x;
    if (isChromaGreen(top)) floodFromSeed(top);
    if (height > 1) {
      const bot = (height - 1) * width + x;
      if (isChromaGreen(bot)) floodFromSeed(bot);
    }
  }
  for (let y = 1; y < height - 1; y++) {
    const left = y * width;
    if (isChromaGreen(left)) floodFromSeed(left);
    if (width > 1) {
      const right = y * width + (width - 1);
      if (isChromaGreen(right)) floodFromSeed(right);
    }
  }

  // 2. Flood-fill enclosed chroma-green pockets (hair/neck/arm gaps)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!visited[idx] && isEnclosedSeed(idx)) {
        floodFromSeed(idx);
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (visited[i] === 1) {
      data[i * 4 + 3] = 0;
    }
  }

  // 3. 2-ring boundary feathering + green spill suppression (handles JPEG 2px ringing)
  const ring1 = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] === 1) continue;
      let hasBg = false;
      for (let dy = -1; dy <= 1 && !hasBg; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx >= 0 && nx < width && visited[ny * width + nx] === 1) {
            hasBg = true;
            break;
          }
        }
      }
      if (hasBg) ring1[idx] = 1;
    }
  }

  const ring2 = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] === 1 || ring1[idx] === 1) continue;
      if (
        (x > 0 && ring1[idx - 1] === 1) ||
        (x + 1 < width && ring1[idx + 1] === 1) ||
        (y > 0 && ring1[idx - width] === 1) ||
        (y + 1 < height && ring1[idx + width] === 1)
      ) {
        ring2[idx] = 1;
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (ring1[i] === 1) {
      const p = i * 4;
      const a = data[p + 3];
      if (a === 0) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const maxRB = Math.max(r, b);
      const greenExcess = g - maxRB;
      if (greenExcess > 6) {
        const alphaFactor = Math.max(0, Math.min(1, 1 - (greenExcess - 6) / 28));
        const newA = Math.round(a * alphaFactor);
        if (newA === 0) {
          data[p + 3] = 0;
        } else {
          const targetG = maxRB < 85 ? Math.round(maxRB * 0.96) : maxRB;
          data[p + 1] = Math.min(g, targetG);
          data[p + 3] = newA;
        }
      }
    } else if (ring2[i] === 1) {
      const p = i * 4;
      const a = data[p + 3];
      if (a === 0) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const maxRB = Math.max(r, b);
      const greenExcess = g - maxRB;
      if (greenExcess > 8) {
        const alphaFactor = Math.max(0.25, Math.min(1, 1 - (greenExcess - 8) / 48));
        data[p + 1] = Math.min(g, maxRB);
        data[p + 3] = Math.round(a * alphaFactor);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function renderImageToDataUrl(
  img: HTMLImageElement,
  options: {
    maxDim: number;
    removeGreenBg: boolean;
    outputMime: 'image/png' | 'image/jpeg';
    quality?: number;
  }
): string {
  const { maxDim, removeGreenBg, outputMime, quality = 0.86 } = options;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法初始化图像处理画布');
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (removeGreenBg) {
    removeGreenScreenFromCanvas(ctx, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }
  return canvas.toDataURL(outputMime, quality);
}

/**
 * Compresses/resizes uploaded local images so base64 DataURLs fit safely in localStorage,
 * and optionally extracts a transparent PNG background from chroma-key green screen sprites.
 */
function readAndCompressImage(
  file: File,
  options: { maxDim?: number; removeGreenBg?: boolean } = {}
): Promise<string> {
  const { maxDim = 1280, removeGreenBg = false } = options;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        if (!removeGreenBg && img.width <= maxDim && img.height <= maxDim && file.size <= 400 * 1024) {
          resolve(dataUrl);
          return;
        }
        try {
          const isPng = file.type === 'image/png' || removeGreenBg;
          resolve(
            renderImageToDataUrl(img, {
              maxDim,
              removeGreenBg,
              outputMime: isPng ? 'image/png' : 'image/jpeg',
            })
          );
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function removeGreenScreenFromUrl(src: string, maxDim = 860): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onerror = () => reject(new Error('图片加载失败，无法执行去绿幕'));
    img.onload = () => {
      try {
        resolve(
          renderImageToDataUrl(img, {
            maxDim,
            removeGreenBg: true,
            outputMime: 'image/png',
          })
        );
      } catch {
        reject(new Error('外链图片受跨域限制无法读取像素，请先下载到本地后上传去绿幕'));
      }
    };
    img.src = src;
  });
}

export const NpcConfigModal: React.FC<NpcConfigModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
  onReset,
}) => {
  const [draft, setDraft] = useState<NpcConfig>(config);
  const [uploadingKey, setUploadingKey] = useState<NpcExpression | 'bg' | null>(null);
  const [autoRemoveGreenBg, setAutoRemoveGreenBg] = useState(true);
  const [bgProcessNotice, setBgProcessNotice] = useState<string | null>(null);
  const [showPromptGuide, setShowPromptGuide] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'spec' | 'templates' | 'presets'>('spec');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTargetRef = useRef<NpcExpression | 'bg' | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard fallback ignored cleanly in restricted contexts
    }
  };

  const renderCopyableBlock = (key: string, label: string, promptText: string, sublabel?: string) => {
    const isCopied = copiedKey === key;
    return (
      <div
        key={key}
        className="rounded-lg border border-amber-800/20 dark:border-amber-700/35 bg-white/85 dark:bg-stone-950/60 p-2.5 space-y-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-stone-800 dark:text-stone-100">{label}</span>
            {sublabel && (
              <span className="ml-1.5 text-[10px] text-stone-500 dark:text-stone-400">{sublabel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => copyText(key, promptText)}
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
              isCopied
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 border-amber-400/50'
            }`}
          >
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{isCopied ? '已复制' : '一键复制'}</span>
          </button>
        </div>
        <pre className="text-[10.5px] leading-relaxed font-mono whitespace-pre-wrap break-words text-stone-700 dark:text-stone-300 bg-stone-100/80 dark:bg-black/40 rounded-md p-2 border border-stone-200/70 dark:border-stone-800 select-all">
          {promptText}
        </pre>
      </div>
    );
  };

  useEffect(() => {
    if (isOpen) {
      setDraft({
        ...config,
        expressions: { ...config.expressions },
      });
      setBgProcessNotice(null);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const triggerFilePicker = (target: NpcExpression | 'bg') => {
    activeTargetRef.current = target;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = activeTargetRef.current;
    if (!file || !target) return;

    setUploadingKey(target);
    setBgProcessNotice(null);
    try {
      const shouldRemoveGreenBg =
        target !== 'bg' && draft.displayMode === 'sprite' && autoRemoveGreenBg;
      const dataUrl = await readAndCompressImage(file, {
        maxDim: target === 'bg' ? 1280 : shouldRemoveGreenBg ? 860 : 1280,
        removeGreenBg: shouldRemoveGreenBg,
      });
      if (target === 'bg') {
        setDraft((prev) => ({ ...prev, customBgUrl: dataUrl }));
      } else {
        setDraft((prev) => ({
          ...prev,
          expressions: { ...prev.expressions, [target]: dataUrl },
        }));
        if (shouldRemoveGreenBg) {
          setBgProcessNotice(
            `已为「${EXPRESSION_META[target].label}」自动执行绿幕泛洪抠图与边缘溢色消除。`
          );
        }
      }
    } finally {
      setUploadingKey(null);
      activeTargetRef.current = null;
    }
  };

  const handleRemoveGreenBgForExpr = async (expr: NpcExpression) => {
    const src = draft.expressions[expr]?.trim();
    if (!src) return;
    setUploadingKey(expr);
    setBgProcessNotice(null);
    try {
      const processed = await removeGreenScreenFromUrl(src, 860);
      setDraft((prev) => ({
        ...prev,
        expressions: { ...prev.expressions, [expr]: processed },
      }));
      setBgProcessNotice(`已完成「${EXPRESSION_META[expr].label}」绿幕抠图，已转换为透明 PNG。`);
    } catch (err) {
      setBgProcessNotice(err instanceof Error ? err.message : '去绿幕处理失败');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleApplyPreset = (preset: NpcPreset, saveImmediately = false) => {
    const nextConfig: NpcConfig = {
      ...preset.config,
      expressions: { ...preset.config.expressions },
    };
    setDraft(nextConfig);
    if (saveImmediately) {
      onSave(nextConfig);
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...draft,
      name: draft.name.trim() || DEFAULT_NPC_CONFIG.name,
      title: draft.title.trim() || DEFAULT_NPC_CONFIG.title,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl bg-[#fbf6ea] dark:bg-[#1e1915] text-stone-900 dark:text-stone-100 rounded-2xl border-2 border-amber-700/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-amber-800/20 dark:border-amber-700/30 bg-[#f4ead1] dark:bg-[#282019] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-600 text-amber-50 flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-wide">看板娘 NPC 形象与设定</h3>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  支持修改称呼、立绘展示模式，或为 5 种表情替换图片 URL / 本地上传立绘
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Built-in Presets (Sprite Overlay Mode) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                  🎨 看板娘与背景预设（立绘叠加模式 · 一键切换）
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  选择后可微调下方配置，或点「立即启用」直接应用
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {NPC_PRESETS.map((preset) => {
                  const isSelected = draft.presetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset, false)}
                      className={`group rounded-xl border-2 overflow-hidden cursor-pointer transition-all flex flex-col ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10 shadow-md'
                          : 'border-amber-800/20 dark:border-amber-700/35 bg-white/75 dark:bg-stone-900/60 hover:border-amber-500/70'
                      }`}
                    >
                      {/* Composite Preview: Background + Overlaid Transparent Sprite */}
                      <div className="relative h-28 w-full overflow-hidden bg-[#1e1510]">
                        {preset.config.displayMode === 'sprite' && preset.config.customBgUrl ? (
                          <>
                            <img
                              src={preset.config.customBgUrl}
                              alt={preset.themeName}
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                            <img
                              src={preset.config.expressions.normal}
                              alt={preset.config.name}
                              className="absolute bottom-0 right-2 h-[96%] w-auto object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                            />
                          </>
                        ) : (
                          <>
                            <img
                              src={preset.config.expressions.normal}
                              alt={preset.config.name}
                              className="absolute inset-0 w-full h-full object-cover object-top"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                          </>
                        )}

                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-black/75 border border-amber-400/50 text-[10px] font-bold text-amber-100 backdrop-blur-xs">
                            {preset.badge}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-amber-950 text-[10px] font-extrabold flex items-center gap-0.5">
                              <Check className="w-3 h-3" />
                              当前选中
                            </span>
                          )}
                        </div>

                        <div className="absolute bottom-2 left-2.5 right-24 text-white">
                          <div className="text-xs font-extrabold truncate drop-shadow">
                            {preset.config.name} · {preset.config.title}
                          </div>
                          <div className="text-[10px] text-amber-200/90 truncate">{preset.themeName}</div>
                        </div>
                      </div>

                      <div className="p-2.5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-stone-600 dark:text-stone-300 line-clamp-2 leading-snug">
                          {preset.desc}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyPreset(preset, true);
                          }}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                        >
                          立即启用
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Name, Title & Display Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  看板娘名字
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：艾莉丝"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-stone-900/80 border border-amber-800/25 dark:border-amber-700/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  公会头衔
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="例如：公会首席接待员"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-stone-900/80 border border-amber-800/25 dark:border-amber-700/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
            </div>

            {/* Display Mode */}
            <div className="p-3 rounded-xl bg-amber-900/5 dark:bg-black/25 border border-amber-800/15 dark:border-amber-700/25 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  立绘渲染模式
                </span>
                <div className="flex items-center gap-1.5 bg-white/70 dark:bg-stone-900 p-1 rounded-lg border border-amber-800/20">
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, displayMode: 'scene' }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      draft.displayMode === 'scene'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    全场景 CG 模式
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, displayMode: 'sprite' }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      draft.displayMode === 'sprite'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    透明立绘叠加模式
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {draft.displayMode === 'scene'
                  ? '全场景 CG 模式：图片直接铺满公会接待台背景（推荐用于自带背景的横版插画，默认内置立绘即为此模式）。'
                  : '透明立绘叠加模式：将角色立绘居中悬浮在公会背景之上，适合使用透明背景 PNG 人物立绘时开启。'}
              </p>

              {draft.displayMode === 'sprite' && (
                <div className="pt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={draft.customBgUrl || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, customBgUrl: e.target.value }))}
                    placeholder="可选：自定义背景图 URL（留空则使用默认公会暖光背景）"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white/80 dark:bg-stone-900/80 border border-amber-800/20 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => triggerFilePicker('bg')}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border border-amber-700/30 hover:bg-amber-200/70 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>传背景</span>
                  </button>
                </div>
              )}
            </div>

            {/* AI Sprite & Background Generation Prompt Workshop */}
            <div className="rounded-xl border border-amber-600/35 bg-gradient-to-br from-amber-500/8 via-amber-500/4 to-transparent overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPromptGuide((prev) => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-amber-600/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Wand2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-amber-950 dark:text-amber-200 truncate">
                      🪄 看板娘外部 AI 生成规格与提示词工坊
                    </div>
                    <div className="text-[10.5px] text-stone-500 dark:text-stone-400 truncate">
                      包含立绘构图比例、#00FF00 绿幕去背技巧、5 种表情差分后缀及预设参考 Prompt（支持一键复制）
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-amber-700 dark:text-amber-300 flex items-center gap-1 text-[11px] font-bold">
                  <span>{showPromptGuide ? '收起' : '展开参考'}</span>
                  {showPromptGuide ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </span>
              </button>

              {showPromptGuide && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-amber-700/20 space-y-3">
                  {/* Tabs */}
                  <div className="flex items-center gap-1.5 bg-white/70 dark:bg-stone-900/80 p-1 rounded-lg border border-amber-800/20 w-fit">
                    {(
                      [
                        { id: 'spec', label: '📐 尺寸与构图规范' },
                        { id: 'templates', label: '✍️ 通用模板与 5 表情差分' },
                        { id: 'presets', label: '🎭 内置 3 套预设原稿 Prompt' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveGuideTab(tab.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          activeGuideTab === tab.id
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeGuideTab === 'spec' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                      <div className="rounded-lg border border-amber-800/20 dark:border-amber-700/30 bg-white/80 dark:bg-stone-950/60 p-3 space-y-1.5">
                        <div className="font-extrabold text-amber-900 dark:text-amber-200">
                          ✨ 透明立绘叠加模式（推荐）
                        </div>
                        <ul className="space-y-1 text-stone-600 dark:text-stone-300 list-disc pl-4">
                          <li>
                            <strong>比例尺寸</strong>：<code>1:1</code>（推荐 1024×1024）或{' '}
                            <code>3:4</code> 竖图；透明底 <code>PNG</code>（上传时自动压缩适配本地缓存）。
                          </li>
                          <li>
                            <strong>构图铁律</strong>：<strong>腰部以上半身像</strong>，人物腰际下缘必须
                            <strong>紧贴画布最底边</strong>（Flush with bottom edge），切勿悬空或底部留白；头顶、兽耳及手势四周留{' '}
                            <code>8%~10%</code> 边距以免裁切。
                          </li>
                          <li>
                            <strong>去背技巧</strong>：若绘图工具无法直出透明背景，建议加词{' '}
                            <code>isolated on a pure flat solid chroma key green screen background (#00FF00), no green lighting spill on character</code>{' '}
                            生成纯绿幕图，上传后开启下方「自动去绿幕」即可转为透明 PNG。
                          </li>
                          <li>
                            <strong>舞台背景</strong>：<code>16:9</code> 横版纯场景（建议 1920×1080），画面中央适度留空且不含人物（
                            <code>no people, no characters</code>）。
                          </li>
                        </ul>
                      </div>

                      <div className="rounded-lg border border-amber-800/20 dark:border-amber-700/30 bg-white/80 dark:bg-stone-950/60 p-3 space-y-1.5">
                        <div className="font-extrabold text-amber-900 dark:text-amber-200">
                          🖼️ 全屏场景 CG 模式
                        </div>
                        <ul className="space-y-1 text-stone-600 dark:text-stone-300 list-disc pl-4">
                          <li>
                            <strong>比例尺寸</strong>：<code>16:9</code> 横版带背景插画（推荐 1920×1080 / 1376×768），可用 JPG 或 PNG。
                          </li>
                          <li>
                            <strong>构图位置</strong>：人物头部与胸口应处在画面中上部（垂直约{' '}
                            <code>15%~55%</code> 高度），画面底部约 <code>35%</code> 会被接待对话框遮挡。
                          </li>
                          <li>
                            <strong>一致性建议</strong>：生成 5 种差分表情时，固定角色外貌描述与种子（Seed）或使用图生图（Img2Img / 角色参考），仅替换表情与手部动作后缀。
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {activeGuideTab === 'templates' && (
                    <div className="space-y-2.5">
                      {renderCopyableBlock(
                        'tpl-char-base',
                        '1️⃣ 通用人物立绘基底模板（透明叠加模式用 · 先填方括号内人设）',
                        AI_PROMPT_TEMPLATES.characterBase
                      )}

                      <div className="rounded-lg border border-amber-800/20 dark:border-amber-700/35 bg-white/80 dark:bg-stone-950/60 p-2.5 space-y-2">
                        <div className="text-[11px] font-extrabold text-stone-800 dark:text-stone-100">
                          2️⃣ 五种情感差分后缀（固定上方角色设定后，分别拼接以下后缀生成 5 张差分）
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {EXPRESSION_ORDER.map((expr) => {
                            const suffix = EXPRESSION_PROMPT_SUFFIXES[expr];
                            const key = `tpl-expr-${expr}`;
                            const isCopied = copiedKey === key;
                            return (
                              <div
                                key={expr}
                                className="flex items-start justify-between gap-2 rounded-md bg-stone-100/80 dark:bg-black/35 p-2 border border-stone-200/70 dark:border-stone-800"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="text-[10.5px] font-bold text-amber-900 dark:text-amber-300">
                                    {EXPRESSION_META[expr].badge} · {suffix.shortCn}
                                  </div>
                                  <div className="text-[10.5px] font-mono text-stone-700 dark:text-stone-300 break-words">
                                    {suffix.prompt}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => copyText(key, suffix.prompt)}
                                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    isCopied
                                      ? 'bg-emerald-600 text-white border-emerald-500'
                                      : 'bg-white dark:bg-stone-900 hover:bg-amber-50 text-amber-800 dark:text-amber-200 border-amber-400/50'
                                  }`}
                                >
                                  {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  <span>{isCopied ? '已复制' : '复制后缀'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {renderCopyableBlock(
                        'tpl-bg-base',
                        '3️⃣ 通用 16:9 舞台背景模板（纯场景无人物 · 用于透明叠加模式底图）',
                        AI_PROMPT_TEMPLATES.backgroundBase
                      )}
                    </div>
                  )}

                  {activeGuideTab === 'presets' && (
                    <div className="space-y-2.5">
                      <p className="text-[10.5px] text-stone-500 dark:text-stone-400">
                        以下是内置 3 套立绘叠加预设对应的 Prompt 参考；如需扩展同款画风新表情或微调背景，可直接复制并在末尾附加「表情差分后缀」。
                      </p>
                      {PRESET_PROMPTS.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-amber-800/20 dark:border-amber-700/35 bg-white/75 dark:bg-stone-900/60 p-2.5 space-y-2"
                        >
                          <div className="text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
                            {item.title}
                          </div>
                          {renderCopyableBlock(`preset-${item.id}-sprite`, '角色立绘（1:1 纯绿幕底）', item.spritePrompt)}
                          {renderCopyableBlock(`preset-${item.id}-bg`, '配套背景（16:9 纯场景）', item.bgPrompt)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Expressions List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                    五种情感差分立绘配置
                  </span>
                  {draft.displayMode === 'sprite' && (
                    <button
                      type="button"
                      onClick={() => setAutoRemoveGreenBg((prev) => !prev)}
                      title="开启后，在立绘叠加模式下上传绿幕本地图片会自动执行色键泛洪抠图并消除边缘绿光溢出"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border transition-colors cursor-pointer ${
                        autoRemoveGreenBg
                          ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                          : 'bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-400/30'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>上传自动去绿幕：{autoRemoveGreenBg ? '已开启' : '已关闭'}</span>
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-stone-400">支持本地图片（自动压缩存本地）或网络图片 URL</span>
              </div>

              {bgProcessNotice && (
                <div className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-[11px] text-amber-900 dark:text-amber-200 font-medium">
                  {bgProcessNotice}
                </div>
              )}

              <div className="space-y-2.5">
                {EXPRESSION_ORDER.map((expr) => {
                  const meta = EXPRESSION_META[expr];
                  const val = draft.expressions[expr] || '';
                  const exprCopyKey = `row-expr-${expr}`;
                  const isExprCopied = copiedKey === exprCopyKey;
                  return (
                    <div
                      key={expr}
                      className="p-2.5 rounded-xl bg-white/75 dark:bg-stone-900/60 border border-amber-800/20 dark:border-amber-700/30 flex items-center gap-3"
                    >
                      <div
                        className={`w-20 h-12 rounded-lg overflow-hidden border border-amber-800/20 shrink-0 flex items-center justify-center ${
                          draft.displayMode === 'sprite'
                            ? 'bg-[conic-gradient(#382d25_90deg,#241c17_90deg_180deg,#382d25_180deg_270deg,#241c17_270deg)] bg-[length:12px_12px]'
                            : 'bg-stone-200 dark:bg-stone-800'
                        }`}
                      >
                        {val ? (
                          <img
                            src={val}
                            alt={meta.label}
                            className={`w-full h-full ${
                              draft.displayMode === 'sprite'
                                ? 'object-contain object-bottom'
                                : 'object-cover object-top'
                            }`}
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-stone-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-stone-800 dark:text-stone-100">
                              {meta.label}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800">
                              {meta.badge}
                            </span>
                            <span className="text-[10px] text-stone-400 hidden sm:inline truncate">
                              {meta.desc}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyText(exprCopyKey, EXPRESSION_PROMPT_SUFFIXES[expr].prompt)}
                            title={`复制「${meta.label}」表情动作 Prompt 后缀`}
                            className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                              isExprCopied
                                ? 'bg-emerald-600 text-white border-emerald-500'
                                : 'bg-amber-50/80 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-stone-700 text-amber-800 dark:text-amber-300 border-amber-300/60 dark:border-amber-700/50'
                            }`}
                          >
                            {isExprCopied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                            <span>{isExprCopied ? '已复制后缀' : '复制表情词'}</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={val.startsWith('data:') ? '[已上传本地图片]' : val}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              if (nextVal === '[已上传本地图片]') return;
                              setDraft((prev) => ({
                                ...prev,
                                expressions: { ...prev.expressions, [expr]: nextVal },
                              }));
                            }}
                            placeholder={DEFAULT_NPC_CONFIG.expressions[expr]}
                            className="flex-1 min-w-0 px-2.5 py-1 text-[11px] font-mono rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          {draft.displayMode === 'sprite' && Boolean(val.trim()) && (
                            <button
                              type="button"
                              disabled={uploadingKey === expr}
                              onClick={() => handleRemoveGreenBgForExpr(expr)}
                              title="对当前图片执行绿幕色键抠图并消除边缘绿光溢出，转换为透明 PNG"
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                            >
                              <Wand2 className="w-3 h-3" />
                              <span>去绿幕</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={uploadingKey === expr}
                            onClick={() => triggerFilePicker(expr)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{uploadingKey === expr ? '处理中...' : '上传'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-amber-800/20 dark:border-amber-700/30 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setDraft({
                    ...DEFAULT_NPC_CONFIG,
                    expressions: { ...DEFAULT_NPC_CONFIG.expressions },
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>恢复默认立绘与设定</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存设置</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
