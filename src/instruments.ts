// ─── Instrument library (downloaded from the web on first use) ───────────────
// Everything in this file is loaded from the internet the first time a note is
// played with it — the app itself is fully offline for the *bundled* sounds.
// Sources (checked against the live packages / strudel docs):
//   • GM soundfonts  @strudel/soundfonts — 125 General MIDI instruments,
//     GeneralUserGS + FluidR3, served from felixroos.github.io/webaudiofontdata
//   • VCSL           raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json
//     (Versilian Community Sample Library, S. Gossner — CC0/public domain)
//   • dirt-samples   raw.githubusercontent.com/tidalcycles/dirt-samples/master/strudel.json
//   • tidal-drum-machines  …/main/tidal-drum-machines.json (683 named machine sounds)
//   • mridangam / piano / EmuSP12 — small extra packs

export interface Instrument {
  /** strudel sound name, e.g. "gm_piano" / "piano1" — pass to makeTrack wave: field */
  id: string;
  label: string;
  desc: string;
  /** where the bytes come from */
  source: 'gm' | 'vcsl' | 'pack';
}

export interface InstrumentGroup {
  id: string;
  family: string;
  instruments: Instrument[];
}

const pretty = (id: string): string =>
  id
    .replace(/^gm_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const gm = (id: string, desc?: string): Instrument => ({
  id,
  label: pretty(id),
  desc: desc ?? 'General MIDI soundfont',
  source: 'gm',
});

// ── GM soundfonts — 125 registered names from @strudel/soundfonts gm.mjs ─────
// Grouped by their General MIDI family.
export const GM_FAMILIES: InstrumentGroup[] = [
  { id: 'gm-piano', family: 'Piano', instruments: [
    gm('gm_piano', 'Acoustic, bright & electric pianos'),
    gm('gm_epiano1', 'Electric piano — Rhodes-like'),
    gm('gm_epiano2', 'Electric piano — Wurlitzer-like'),
    gm('gm_harpsichord', 'Plucky keyboard'),
    gm('gm_clavinet', 'Funky Clavinet'),
  ] },
  { id: 'gm-chromatic', family: 'Chromatic Percussion', instruments: [
    gm('gm_celesta'),
    gm('gm_glockenspiel'),
    gm('gm_music_box'),
    gm('gm_vibraphone'),
    gm('gm_marimba'),
    gm('gm_xylophone'),
    gm('gm_tubular_bells'),
    gm('gm_dulcimer'),
  ] },
  { id: 'gm-organ', family: 'Organ', instruments: [
    gm('gm_drawbar_organ', 'Hammond-style drawbars'),
    gm('gm_percussive_organ'),
    gm('gm_rock_organ'),
    gm('gm_church_organ', 'Pipe organ — full'),
    gm('gm_reed_organ'),
    gm('gm_accordion'),
    gm('gm_harmonica'),
    gm('gm_bandoneon'),
  ] },
  { id: 'gm-guitar', family: 'Guitar', instruments: [
    gm('gm_acoustic_guitar_nylon'),
    gm('gm_acoustic_guitar_steel'),
    gm('gm_electric_guitar_jazz'),
    gm('gm_electric_guitar_clean'),
    gm('gm_electric_guitar_muted'),
    gm('gm_overdriven_guitar'),
    gm('gm_distortion_guitar'),
    gm('gm_guitar_harmonics'),
  ] },
  { id: 'gm-bass', family: 'Bass', instruments: [
    gm('gm_acoustic_bass'),
    gm('gm_electric_bass_finger'),
    gm('gm_electric_bass_pick'),
    gm('gm_fretless_bass'),
    gm('gm_slap_bass_1'),
    gm('gm_slap_bass_2'),
    gm('gm_synth_bass_1'),
    gm('gm_synth_bass_2'),
  ] },
  { id: 'gm-strings', family: 'Strings', instruments: [
    gm('gm_violin'),
    gm('gm_viola'),
    gm('gm_cello'),
    gm('gm_contrabass'),
    gm('gm_tremolo_strings'),
    gm('gm_pizzicato_strings'),
    gm('gm_orchestral_harp'),
    gm('gm_timpani'),
  ] },
  { id: 'gm-ensemble', family: 'Ensemble & Choir', instruments: [
    gm('gm_string_ensemble_1'),
    gm('gm_string_ensemble_2'),
    gm('gm_synth_strings_1'),
    gm('gm_synth_strings_2'),
    gm('gm_choir_aahs'),
    gm('gm_voice_oohs'),
    gm('gm_synth_choir'),
    gm('gm_orchestra_hit'),
  ] },
  { id: 'gm-brass', family: 'Brass', instruments: [
    gm('gm_trumpet'),
    gm('gm_trombone'),
    gm('gm_tuba'),
    gm('gm_muted_trumpet'),
    gm('gm_french_horn'),
    gm('gm_brass_section'),
    gm('gm_synth_brass_1'),
    gm('gm_synth_brass_2'),
  ] },
  { id: 'gm-reed', family: 'Reed', instruments: [
    gm('gm_soprano_sax'),
    gm('gm_alto_sax'),
    gm('gm_tenor_sax'),
    gm('gm_baritone_sax'),
    gm('gm_oboe'),
    gm('gm_english_horn'),
    gm('gm_bassoon'),
    gm('gm_clarinet'),
  ] },
  { id: 'gm-pipe', family: 'Pipe', instruments: [
    gm('gm_piccolo'),
    gm('gm_flute'),
    gm('gm_recorder'),
    gm('gm_pan_flute'),
    gm('gm_blown_bottle'),
    gm('gm_shakuhachi'),
    gm('gm_whistle'),
    gm('gm_ocarina'),
  ] },
  { id: 'gm-lead', family: 'Synth Lead', instruments: [
    gm('gm_lead_1_square'),
    gm('gm_lead_2_sawtooth'),
    gm('gm_lead_3_calliope'),
    gm('gm_lead_4_chiff'),
    gm('gm_lead_5_charang'),
    gm('gm_lead_6_voice'),
    gm('gm_lead_7_fifths'),
    gm('gm_lead_8_bass_lead'),
  ] },
  { id: 'gm-pad', family: 'Synth Pad', instruments: [
    gm('gm_pad_new_age'),
    gm('gm_pad_warm'),
    gm('gm_pad_poly'),
    gm('gm_pad_choir'),
    gm('gm_pad_bowed'),
    gm('gm_pad_metallic'),
    gm('gm_pad_halo'),
    gm('gm_pad_sweep'),
  ] },
  { id: 'gm-fx', family: 'Synth FX', instruments: [
    gm('gm_fx_rain'),
    gm('gm_fx_soundtrack'),
    gm('gm_fx_crystal'),
    gm('gm_fx_atmosphere'),
    gm('gm_fx_brightness'),
    gm('gm_fx_goblins'),
    gm('gm_fx_echoes'),
    gm('gm_fx_sci_fi'),
  ] },
  { id: 'gm-ethnic', family: 'Ethnic', instruments: [
    gm('gm_sitar'),
    gm('gm_banjo'),
    gm('gm_shamisen'),
    gm('gm_koto'),
    gm('gm_kalimba'),
    gm('gm_bagpipe'),
    gm('gm_fiddle'),
    gm('gm_shanai'),
  ] },
  { id: 'gm-percussive', family: 'Percussive', instruments: [
    gm('gm_tinkle_bell'),
    gm('gm_agogo'),
    gm('gm_steel_drums'),
    gm('gm_woodblock'),
    gm('gm_taiko_drum'),
    gm('gm_melodic_tom'),
    gm('gm_synth_drum'),
    gm('gm_reverse_cymbal'),
  ] },
  { id: 'gm-sfx', family: 'Sound Effects', instruments: [
    gm('gm_guitar_fret_noise'),
    gm('gm_breath_noise'),
    gm('gm_seashore'),
    gm('gm_bird_tweet'),
    gm('gm_telephone'),
    gm('gm_helicopter'),
    gm('gm_applause'),
    gm('gm_gunshot'),
  ] },
];

export const GM_COUNT = GM_FAMILIES.reduce((n, g) => n + g.instruments.length, 0);

// ── VCSL — Versilian Community Sample Library (CC0) ──────────────────────────
// Loaded through the vcsl.json sample map (keys alongside _base). Every key
// listed here was verified against the live JSON.
const vl = (id: string, label: string, desc: string): Instrument => ({ id, label, desc, source: 'vcsl' });

export const VCSL_GROUPS: InstrumentGroup[] = [
  { id: 'vcsl-keys', family: 'VCSL · Keys & Organ', instruments: [
    vl('piano1', 'TX81Z Piano', 'Electric keys'),
    vl('steinway', 'Steinway B', 'Concert grand, sustained'),
    vl('kawai', 'Kawai', 'Grand piano'),
    vl('fmpiano', 'FM Piano', 'FM electric piano'),
    vl('organ_8inch', 'Organ 8′', 'Stopped flute organ'),
    vl('organ_4inch', 'Organ 4′', 'Piccolo organ'),
    vl('organ_full', 'Organ Full', 'Full organ ensemble'),
    vl('pipeorgan_loud', 'Pipe Organ', 'Full pipe organ'),
    vl('pipeorgan_quiet', 'Pipe Organ soft', 'Quiet pipe organ'),
    vl('harmonica', 'Harmonica', 'Diatonic harmonica'),
    vl('harmonica_soft', 'Harmonica soft', 'Soft harmonica'),
    vl('super64', 'Super 64', 'Accordion-like'),
  ] },
  { id: 'vcsl-mallet', family: 'VCSL · Mallets & Bells', instruments: [
    vl('marimba', 'Marimba', 'Outrigger marimba'),
    vl('vibraphone', 'Vibraphone', 'Hard mallets'),
    vl('vibraphone_soft', 'Vibraphone soft', 'Soft mallets'),
    vl('vibraphone_bowed', 'Vibraphone bowed', 'Bowed vibraphone'),
    vl('glockenspiel', 'Glockenspiel', 'Orchestral bells'),
    vl('tubularbells', 'Tubular Bells', 'Chimes'),
    vl('tubularbells2', 'Tubular Bells 2', 'Chimes, second set'),
    vl('kalimba', 'Kalimba', 'Thumb piano'),
    vl('kalimba2', 'Kalimba 2', 'Thumb piano, second'),
    vl('handbells', 'Handbells', 'English handbells'),
    vl('handchimes', 'Handchimes', 'Tubular handchimes'),
    vl('marktrees', 'Mark Tree', 'Shimmering tubes'),
    vl('belltree', 'Bell Tree', 'Glissando bells'),
  ] },
  { id: 'vcsl-strings', family: 'VCSL · Strings & Plucked', instruments: [
    vl('harp', 'Concert Harp', 'Pedal harp'),
    vl('folkharp', 'Folk Harp', 'Lever harp'),
    vl('psaltery_pluck', 'Psaltery plucked', 'Medieval psaltery'),
    vl('psaltery_bow', 'Psaltery bowed', 'Bowed psaltery'),
    vl('psaltery_spiccato', 'Psaltery spiccato', 'Short bow strokes'),
    vl('dantranh', 'Đàn tranh', 'Vietnamese zither'),
    vl('dantranh_tremolo', 'Đàn tranh tremolo', 'Tremolo zither'),
    vl('dantranh_vibrato', 'Đàn tranh vibrato', 'Vibrato zither'),
    vl('strumstick', 'Strumstick', 'Hampered zither'),
  ] },
  { id: 'vcsl-winds', family: 'VCSL · Winds & Voice', instruments: [
    vl('sax', 'Tenor Saxophone', 'Brett, non-vibrato'),
    vl('sax_stacc', 'Tenor Sax staccato', 'Short articulations'),
    vl('sax_vib', 'Tenor Sax vibrato', 'Vibrato'),
    vl('saxello', 'Saxello', 'Straight-neck sax'),
    vl('saxello_stacc', 'Saxello staccato', 'Short articulations'),
    vl('saxello_vib', 'Saxello vibrato', 'Vibrato'),
    vl('recorder_soprano_stacc', 'Soprano Recorder', 'Staccato'),
    vl('recorder_soprano_sus', 'Soprano Recorder sus', 'Sustained'),
    vl('recorder_soprano_vib', 'Soprano Recorder vib', 'Vibrato'),
    vl('recorder_alto_stacc', 'Alto Recorder', 'Staccato'),
    vl('recorder_alto_sus', 'Alto Recorder sus', 'Sustained'),
    vl('recorder_alto_vib', 'Alto Recorder vib', 'Vibrato'),
    vl('recorder_tenor_stacc', 'Tenor Recorder', 'Staccato'),
    vl('recorder_tenor_sus', 'Tenor Recorder sus', 'Sustained'),
    vl('recorder_tenor_vib', 'Tenor Recorder vib', 'Vibrato'),
    vl('recorder_bass_stacc', 'Bass Recorder', 'Staccato'),
    vl('recorder_bass_sus', 'Bass Recorder sus', 'Sustained'),
    vl('recorder_bass_vib', 'Bass Recorder vib', 'Vibrato'),
    vl('ocarina', 'Ocarina', 'Typical ocarina, sustained'),
    vl('ocarina_small', 'Ocarina small', 'Soprano ocarina'),
    vl('ocarina_vib', 'Ocarina vibrato', 'Vibrato'),
    vl('ballwhistle', 'Ball Whistle', 'Small whistle'),
    vl('trainwhistle', 'Train Whistle', 'Steam whistle'),
    vl('siren', 'Siren', 'Hand siren'),
  ] },
  { id: 'vcsl-perc', family: 'VCSL · Drums & World Percussion', instruments: [
    vl('timpani', 'Timpani', 'Sus. pedal timpani'),
    vl('timpani2', 'Timpani 2', 'Second timpani set'),
    vl('timpani_roll', 'Timpani roll', 'Rolls'),
    vl('bassdrum1', 'Bass Drum 1', 'Orchestral kick'),
    vl('bassdrum2', 'Bass Drum 2', 'Second kick'),
    vl('snare_hi', 'Snare high', 'High snare'),
    vl('snare_low', 'Snare low', 'Low snare'),
    vl('snare_modern', 'Snare modern', 'Modern orchestral'),
    vl('snare_rim', 'Snare rim', 'Rim shot'),
    vl('hihat', 'Hi-hat', 'Closed hi-hat'),
    vl('tom_stick', 'Tom (stick)', 'Sticked tom'),
    vl('tom2_stick', 'Tom 2 (stick)', 'Second tom'),
    vl('sus_cymbal', 'Sus. Cymbal', 'Suspended cymbal'),
    vl('sus_cymbal2', 'Sus. Cymbal 2', 'Second cymbal'),
    vl('cajon', 'Cajón', 'Box drum'),
    vl('conga', 'Conga', 'Hand drum'),
    vl('bongo', 'Bongo', 'Bongos'),
    vl('darbuka', 'Darbuka', 'Goblet drum'),
    vl('framedrum', 'Frame Drum', 'Hand frame drum'),
    vl('balafon', 'Balafon', 'West African xylophone'),
    vl('balafon_hard', 'Balafon hard', 'Hard mallets'),
    vl('balafon_soft', 'Balafon soft', 'Soft mallets'),
    vl('agogo', 'Agogo', 'Double bell'),
    vl('clave', 'Clave', 'Cuba claves'),
    vl('guiro', 'Güiro', 'Scraper'),
    vl('cabasa', 'Cabasa', 'Shaker'),
    vl('shaker_large', 'Shaker large', 'Large shaker'),
    vl('shaker_small', 'Shaker small', 'Small shaker'),
    vl('tambourine', 'Tambourine', 'Hand tambourine'),
    vl('gong', 'Gong', 'Concert gong / tam-tam'),
    vl('gong2', 'Gong 2', 'Second gong'),
    vl('anvil', 'Anvil', 'Struck steel'),
    vl('woodblock', 'Woodblock', 'Temple block'),
    vl('triangles', 'Triangle', 'Orchestral triangle'),
    vl('fingercymbal', 'Finger Cymbal', 'Zills'),
    vl('flexatone', 'Flexatone', 'Wobbling metal'),
    vl('ratchet', 'Ratchet', 'Cog rattle'),
    vl('vibraslap', 'Vibraslap', 'Classic vibraslap'),
    vl('oceandrum', 'Ocean Drum', 'Wave drum'),
    vl('clavisynth', 'Clavi Synth', 'Electronic clave'),
    vl('slitdrum', 'Slit Drum', 'Tongue drum'),
  ] },
];

export const VCSL_COUNT = VCSL_GROUPS.reduce((n, g) => n + g.instruments.length, 0);

// ── downloadable packs (registered on demand) ────────────────────────────────
export interface RemotePack {
  id: string;
  label: string;
  desc: string;
  url: string;
  /** how it's referenced in code, shown as a hint */
  usage: string;
}

export const REMOTE_PACKS: RemotePack[] = [
  {
    id: 'vcsl',
    label: 'VCSL — Versilian Community Sample Library',
    desc: `${VCSL_COUNT}+ orchestral & world instruments (CC0). Piano, sax, marimba, timpani…`,
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
    usage: 'note("c3").sound("steinway")',
  },
  {
    id: 'tidal-drum-machines',
    label: 'Tidal Drum Machines',
    desc: '683 machine sounds — TR-808, TR-909, LinnDrum, MPC, DMX… (name_bd / _sd / _hh…)',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
    usage: 's("RolandTR808_bd")',
  },
  {
    id: 'dirt-samples',
    label: 'Dirt Samples (classic Tidal)',
    desc: 'The original TidalCycles sound bank — bd, sd, cp, hh, feel, casio, jazz…',
    url: 'https://raw.githubusercontent.com/tidalcycles/dirt-samples/master/strudel.json',
    usage: 's("feel*4, hh*8")',
  },
  {
    id: 'mridangam',
    label: 'Mridangam',
    desc: 'South Indian percussion (Carnatic). mridangam_nam / tham / num…',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json',
    usage: 's("mridangam_nam*4")',
  },
  {
    id: 'piano',
    label: 'Piano (A0–C8)',
    desc: 'Simple sampled grand, 3 samples per octave.',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
    usage: 'note("c4 e4 g4").sound("piano")',
  },
  {
    id: 'EmuSP12',
    label: 'E-mu SP-12',
    desc: 'Hip-hop drum machine samples — bd, sd, hh, ht/mt/lt, misc…',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/EmuSP12.json',
    usage: 's("EmuSP12_bd bd:3")',
  },
];

/** every instrument id in the library, for search */
export function searchInstruments(query: string): { group: InstrumentGroup; instruments: Instrument[] }[] {
  const q = query.trim().toLowerCase();
  const groups = [...GM_FAMILIES, ...VCSL_GROUPS];
  const out: { group: InstrumentGroup; instruments: Instrument[] }[] = [];
  for (const group of groups) {
    const hits = group.instruments.filter(
      (i) => !q || i.id.toLowerCase().includes(q) || i.label.toLowerCase().includes(q) || group.family.toLowerCase().includes(q),
    );
    if (hits.length) out.push({ group, instruments: hits });
  }
  return out;
}
