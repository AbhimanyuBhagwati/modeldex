export interface HuggingFaceSource {
  org: string;
  /** Narrows the listing for orgs with thousands of repos. */
  search?: string;
}

/** Each lab's card art has its own look, the way each type has its own frame in a card game. */
export type ArtStyle =
  | 'rosette'
  | 'strata'
  | 'sparkle'
  | 'singularity'
  | 'lissajous'
  | 'pixels'
  | 'abyss'
  | 'honeycomb'
  | 'moon'
  | 'circuit'
  | 'halftone'
  | 'waveform'
  | 'radar'
  | 'lowpoly'
  | 'prism'
  | 'network'
  | 'flow'
  | 'emblem'
  | 'orbit';

/** The generated style: one glyph repeated in one layout. Labs without a recipe get one derived from their key. */
export const GLYPHS = ['triangle', 'square', 'diamond', 'hexagon', 'circle', 'ring', 'plus', 'star'] as const;
export const LAYOUTS = ['grid', 'radial', 'spiral', 'scatter', 'wave', 'concentric'] as const;
export interface EmblemRecipe {
  glyph: (typeof GLYPHS)[number];
  layout: (typeof LAYOUTS)[number];
}

export interface LabConfig {
  /** Stable key used in URLs. Never change it once published. */
  key: string;
  name: string;
  /** Card frame color. */
  color: string;
  art: ArtStyle;
  emblem?: EmblemRecipe;
  /** models.dev provider ids that carry this lab's first-party listings. The first one supplies the docs link. */
  providers: string[];
  /** Model ids or names this lab makes. Used to drop other labs' models from a lab's own listing. */
  match: RegExp;
  /** Keep only listings that match `match`. For providers that also resell other labs' models. */
  strict?: boolean;
  /** Listings to ignore, such as resold copies under a partner prefix. */
  skip?: RegExp;
  /** Shown for open-weight models when Hugging Face has no matching repo. */
  defaultLicense: string | null;
  huggingFace?: HuggingFaceSource[];
}

/**
 * To add a lab: append an entry, run `npm run sync`, and commit the result.
 * Colors and art styles are "types" in the card game sense, so keep them distinct from each other.
 */
export const LABS: LabConfig[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    color: '#1E9E77',
    art: 'rosette',
    providers: ['openai'],
    match: /^(gpt|o\d|chatgpt|codex|dall-?e|whisper|tts-|text-embedding-3|text-embedding-ada|sora|omni-moderation|computer-use|davinci|babbage)/i,
    defaultLicense: 'Apache 2.0',
    huggingFace: [{ org: 'openai' }],
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    color: '#D4704A',
    art: 'strata',
    providers: ['anthropic'],
    match: /^claude/i,
    defaultLicense: null,
  },
  {
    key: 'google',
    name: 'Google',
    color: '#3A78EE',
    art: 'sparkle',
    providers: ['google'],
    match: /^(gemini|gemma|imagen|veo|lyria|learnlm|nano.?banana|deep-research|text-embedding-00|embedding-00)/i,
    defaultLicense: 'Gemma license',
    huggingFace: [{ org: 'google', search: 'gemma' }],
  },
  {
    key: 'xai',
    name: 'xAI',
    color: '#7C8494',
    art: 'singularity',
    providers: ['xai'],
    match: /^grok/i,
    defaultLicense: null,
  },
  {
    key: 'meta',
    name: 'Meta',
    color: '#D8457A',
    art: 'lissajous',
    providers: ['meta', 'llama'],
    match: /^(llama|meta-llama|muse)/i,
    skip: /^(cerebras|groq)-/i,
    defaultLicense: 'Llama license',
    huggingFace: [{ org: 'meta-llama' }],
  },
  {
    key: 'mistral',
    name: 'Mistral',
    color: '#EE8A1A',
    art: 'pixels',
    providers: ['mistral'],
    match: /^(mistral|magistral|codestral|devstral|pixtral|ministral|voxtral|mixtral|open-mi[sx]tral)/i,
    defaultLicense: 'Apache 2.0',
    huggingFace: [{ org: 'mistralai' }],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    color: '#22A9C4',
    art: 'abyss',
    providers: ['deepseek'],
    match: /^deepseek/i,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'deepseek-ai' }],
  },
  {
    key: 'qwen',
    name: 'Qwen',
    color: '#8A5CF5',
    art: 'honeycomb',
    providers: ['alibaba'],
    match: /^(qwen|qwq|qvq|wan)/i,
    defaultLicense: 'Apache 2.0',
    huggingFace: [{ org: 'Qwen' }],
  },
  {
    key: 'moonshot',
    name: 'Moonshot',
    color: '#4C5270',
    art: 'moon',
    providers: ['moonshotai'],
    match: /^(kimi|moonshot)/i,
    defaultLicense: 'Modified MIT',
    huggingFace: [{ org: 'moonshotai' }],
  },
  {
    key: 'zai',
    name: 'Z.ai',
    color: '#B8892B',
    art: 'circuit',
    providers: ['zai'],
    match: /^(glm|cogview|zai-glm|chatglm|autoglm)/i,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'zai-org' }],
  },
  {
    key: 'cohere',
    name: 'Cohere',
    color: '#6E9A2E',
    art: 'halftone',
    providers: ['cohere'],
    match: /^(command|north|aya|embed-|rerank|c4ai)/i,
    defaultLicense: 'CC BY-NC 4.0',
    huggingFace: [{ org: 'CohereLabs' }],
  },
  {
    key: 'minimax',
    name: 'MiniMax',
    color: '#E0484A',
    art: 'waveform',
    providers: ['minimax'],
    match: /^(minimax|abab|speech-|hailuo|music-)/i,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'MiniMaxAI' }],
  },
  // Labs below publish through a provider that may also carry other companies' models, so most are strict.
  {
    key: 'amazon',
    name: 'Amazon',
    color: '#E8912D',
    art: 'prism',
    providers: ['nova', 'amazon-bedrock'],
    match: /^(amazon\.)?(nova|titan)/i,
    skip: /^(us|eu|apac|jp|ca|au|global|us-gov)\./i,
    strict: true,
    defaultLicense: null,
  },
  {
    key: 'microsoft',
    name: 'Microsoft',
    color: '#4A67B5',
    art: 'network',
    providers: ['azure'],
    match: /^(phi|mai-)/i,
    strict: true,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'microsoft', search: 'phi' }],
  },
  {
    key: 'nvidia',
    name: 'NVIDIA',
    color: '#76B900',
    art: 'lowpoly',
    providers: ['nvidia'],
    match: /nemotron|cosmos/i,
    strict: true,
    defaultLicense: 'NVIDIA Open Model license',
    huggingFace: [{ org: 'nvidia', search: 'nemotron' }],
  },
  {
    key: 'bytedance',
    name: 'ByteDance',
    color: '#325AB4',
    art: 'flow',
    providers: ['volcengine'],
    match: /^(doubao|seed|skylark)/i,
    strict: true,
    defaultLicense: null,
    huggingFace: [{ org: 'ByteDance-Seed' }],
  },
  {
    key: 'perplexity',
    name: 'Perplexity',
    color: '#1F8A8A',
    art: 'radar',
    providers: ['perplexity'],
    match: /^sonar/i,
    strict: true,
    defaultLicense: null,
  },
  {
    key: 'ibm',
    name: 'IBM',
    color: '#0F62FE',
    art: 'emblem',
    emblem: { glyph: 'square', layout: 'grid' },
    providers: ['watsonx'],
    match: /granite/i,
    strict: true,
    defaultLicense: 'Apache 2.0',
    huggingFace: [{ org: 'ibm-granite' }],
  },
  {
    key: 'tencent',
    name: 'Tencent',
    color: '#2A6FDB',
    art: 'emblem',
    emblem: { glyph: 'ring', layout: 'concentric' },
    providers: ['tencent-tokenhub'],
    match: /^(hy\d|hunyuan)/i,
    strict: true,
    defaultLicense: 'Tencent Hunyuan license',
    huggingFace: [{ org: 'tencent', search: 'hunyuan' }],
  },
  {
    key: 'xiaomi',
    name: 'Xiaomi',
    color: '#FF6900',
    art: 'emblem',
    emblem: { glyph: 'circle', layout: 'spiral' },
    providers: ['xiaomi'],
    match: /^mimo/i,
    strict: true,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'XiaomiMiMo' }],
  },
  {
    key: 'stepfun',
    name: 'StepFun',
    color: '#6C7BFF',
    art: 'emblem',
    emblem: { glyph: 'triangle', layout: 'wave' },
    providers: ['stepfun-ai'],
    match: /^step/i,
    strict: true,
    defaultLicense: 'Apache 2.0',
    huggingFace: [{ org: 'stepfun-ai' }],
  },
  {
    key: 'ai21',
    name: 'AI21',
    color: '#B1447A',
    art: 'emblem',
    emblem: { glyph: 'diamond', layout: 'radial' },
    providers: ['ai21'],
    match: /^jamba/i,
    defaultLicense: 'Jamba Open Model license',
    huggingFace: [{ org: 'ai21labs' }],
  },
  {
    key: 'inception',
    name: 'Inception',
    color: '#5AA9E6',
    art: 'emblem',
    emblem: { glyph: 'star', layout: 'scatter' },
    providers: ['inception'],
    match: /^mercury/i,
    defaultLicense: null,
  },
  {
    key: 'upstage',
    name: 'Upstage',
    color: '#6E4BF2',
    art: 'emblem',
    emblem: { glyph: 'plus', layout: 'grid' },
    providers: ['upstage'],
    match: /^solar/i,
    defaultLicense: null,
    huggingFace: [{ org: 'upstage' }],
  },
  {
    key: 'sakana',
    name: 'Sakana',
    color: '#D93B4A',
    art: 'emblem',
    emblem: { glyph: 'circle', layout: 'wave' },
    providers: ['sakana'],
    match: /^(sakana|fugu)/i,
    defaultLicense: null,
  },
  {
    key: 'sarvam',
    name: 'Sarvam',
    color: '#E07B39',
    art: 'emblem',
    emblem: { glyph: 'star', layout: 'radial' },
    providers: ['sarvam'],
    match: /^sarvam/i,
    defaultLicense: null,
    huggingFace: [{ org: 'sarvamai' }],
  },
  {
    key: 'arcee',
    name: 'Arcee',
    color: '#2E9C6A',
    art: 'emblem',
    emblem: { glyph: 'triangle', layout: 'concentric' },
    providers: ['arcee'],
    match: /^(trinity|arcee|afm|virtuoso|maestro|caller|spotlight|coder-large)/i,
    strict: true,
    defaultLicense: 'Apache 2.0',
    huggingFace: [{ org: 'arcee-ai' }],
  },
  {
    key: 'poolside',
    name: 'Poolside',
    color: '#1C7ED6',
    art: 'emblem',
    emblem: { glyph: 'ring', layout: 'wave' },
    providers: ['poolside'],
    match: /laguna|malibu/i,
    strict: true,
    defaultLicense: null,
    huggingFace: [{ org: 'poolside' }],
  },
  {
    key: 'morph',
    name: 'Morph',
    color: '#9B51E0',
    art: 'emblem',
    emblem: { glyph: 'diamond', layout: 'spiral' },
    providers: ['morph'],
    match: /^morph/i,
    strict: true,
    defaultLicense: null,
  },
  {
    key: 'antgroup',
    name: 'Ant Group',
    color: '#1677FF',
    art: 'emblem',
    emblem: { glyph: 'ring', layout: 'radial' },
    providers: ['bailing'],
    match: /^(ling|ring)/i,
    strict: true,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'inclusionAI' }],
  },
  {
    key: 'meituan',
    name: 'Meituan',
    color: '#E0B000',
    art: 'emblem',
    emblem: { glyph: 'hexagon', layout: 'scatter' },
    providers: ['longcat'],
    match: /^longcat/i,
    strict: true,
    defaultLicense: 'MIT',
    huggingFace: [{ org: 'meituan-longcat' }],
  },
  {
    key: 'thinkingmachines',
    name: 'Thinking Machines',
    color: '#4A4A55',
    art: 'emblem',
    emblem: { glyph: 'square', layout: 'spiral' },
    providers: ['thinkingmachines'],
    match: /inkling/i,
    skip: /:peft/i,
    strict: true,
    defaultLicense: null,
  },
  {
    key: 'sensetime',
    name: 'SenseTime',
    color: '#E4572E',
    art: 'emblem',
    emblem: { glyph: 'plus', layout: 'radial' },
    providers: ['sensenova'],
    match: /^sensenova/i,
    strict: true,
    defaultLicense: null,
  },
];

/** Per-model corrections that win over everything the sync derives. Keyed by model key, `${lab}/${slug}`. */
export const LICENSE_OVERRIDES: Record<string, { name: string; url?: string }> = {};
