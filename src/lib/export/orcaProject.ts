import JSZip from 'jszip';
import type { MaterialRecipe } from '../../types/mesh';

// OrcaSlicer 2.5+ stores mixed ("virtual") filaments as ordinary filament slots flagged in the
// project config. Orca only accepts those slots from a complete project config, so instead of
// inventing one we start from a project the user saved in their own Orca setup (their printer,
// process and physical filaments) and append one slot per ColorMix mix.

const PROJECT_CONFIG_PATH = 'Metadata/project_settings.config';
const MODEL_PATH = '3D/3dmodel.model';
const ORCA_MAX_SLOTS = 32;

// Preset::filament_options() in OrcaSlicer v2.5.0-beta (src/libslic3r/Preset.cpp).
const FILAMENT_PRESET_KEYS = new Set<string>([
  'activate_air_filtration', 'activate_air_filtration_during_print', 'activate_air_filtration_on_completion',
  'activate_chamber_temp_control', 'adaptive_pressure_advance', 'adaptive_pressure_advance_bridges',
  'adaptive_pressure_advance_model', 'adaptive_pressure_advance_overhangs', 'additional_cooling_fan_speed',
  'additional_fan_full_speed_layer', 'chamber_minimal_temperature', 'chamber_temperature',
  'close_additional_fan_first_x_layers', 'close_fan_the_first_x_layers', 'compatible_printers',
  'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition',
  'complete_print_exhaust_fan_speed', 'cool_plate_temp', 'cool_plate_temp_initial_layer',
  'default_filament_colour', 'dont_slow_down_outer_wall', 'during_print_exhaust_fan_speed',
  'enable_overhang_bridge_fan', 'enable_pressure_advance', 'eng_plate_temp', 'eng_plate_temp_initial_layer',
  'fan_cooling_layer_time', 'fan_max_speed', 'fan_min_speed', 'filament_adaptive_volumetric_speed',
  'filament_adhesiveness_category', 'filament_change_extrusion_role_gcode', 'filament_change_length',
  'filament_change_length_nc', 'filament_cooling_before_tower', 'filament_cooling_final_speed',
  'filament_cooling_initial_speed', 'filament_cooling_moves', 'filament_cost', 'filament_density',
  'filament_deretraction_speed', 'filament_dev_ams_drying_ams_limitations',
  'filament_dev_ams_drying_heat_distortion_temperature', 'filament_dev_ams_drying_temperature',
  'filament_dev_ams_drying_time', 'filament_dev_chamber_drying_bed_temperature',
  'filament_dev_chamber_drying_time', 'filament_dev_drying_cooling_temperature',
  'filament_dev_drying_softening_temperature', 'filament_diameter', 'filament_end_gcode',
  'filament_extruder_compatibility', 'filament_extruder_variant', 'filament_flow_ratio',
  'filament_flush_temp', 'filament_flush_temp_fast', 'filament_flush_volumetric_speed',
  'filament_ironing_flow', 'filament_ironing_inset', 'filament_ironing_spacing', 'filament_ironing_speed',
  'filament_is_support', 'filament_loading_speed', 'filament_loading_speed_start',
  'filament_long_retractions_when_cut', 'filament_max_volumetric_speed',
  'filament_minimal_purge_on_wipe_tower', 'filament_multitool_ramming', 'filament_multitool_ramming_flow',
  'filament_multitool_ramming_volume', 'filament_notes', 'filament_plugin_config_overrides',
  'filament_pre_cooling_temperature', 'filament_pre_cooling_temperature_nc',
  'filament_preheat_temperature_delta', 'filament_prime_volume', 'filament_prime_volume_nc',
  'filament_printable', 'filament_ramming_parameters', 'filament_ramming_travel_time',
  'filament_ramming_travel_time_nc', 'filament_ramming_volumetric_speed',
  'filament_ramming_volumetric_speed_nc', 'filament_retract_after_wipe', 'filament_retract_before_wipe',
  'filament_retract_length_nc', 'filament_retract_length_toolchange', 'filament_retract_lift_above',
  'filament_retract_lift_below', 'filament_retract_lift_enforce', 'filament_retract_restart_extra',
  'filament_retract_restart_extra_toolchange', 'filament_retract_when_changing_layer',
  'filament_retraction_distances_when_cut', 'filament_retraction_length',
  'filament_retraction_minimum_travel', 'filament_retraction_speed', 'filament_shrink',
  'filament_shrinkage_compensation_z', 'filament_soluble', 'filament_stamping_distance',
  'filament_stamping_loading_speed', 'filament_start_gcode', 'filament_toolchange_delay',
  'filament_tower_interface_pre_extrusion_dist', 'filament_tower_interface_pre_extrusion_length',
  'filament_tower_interface_print_temp', 'filament_tower_interface_purge_volume',
  'filament_tower_ironing_area', 'filament_type', 'filament_unloading_speed',
  'filament_unloading_speed_start', 'filament_vendor', 'filament_wipe', 'filament_wipe_distance',
  'filament_z_hop', 'filament_z_hop_types', 'first_x_layer_fan_speed', 'full_fan_speed_layer',
  'hot_plate_temp', 'hot_plate_temp_initial_layer', 'idle_temperature', 'inherits',
  'initial_layer_fan_speed', 'internal_bridge_fan_speed', 'ironing_fan_speed', 'long_retractions_when_ec',
  'nozzle_temperature', 'nozzle_temperature_initial_layer', 'nozzle_temperature_range_high',
  'nozzle_temperature_range_low', 'overhang_fan_speed', 'overhang_fan_threshold', 'pellet_flow_coefficient',
  'pressure_advance', 'reduce_fan_stop_start_freq', 'required_nozzle_HRC', 'retraction_distances_when_ec',
  'slow_down_for_layer_cooling', 'slow_down_layer_time', 'slow_down_min_speed', 'supertack_plate_temp',
  'supertack_plate_temp_initial_layer', 'support_material_interface_fan_speed', 'temperature_vitrification',
  'textured_cool_plate_temp', 'textured_cool_plate_temp_initial_layer', 'textured_plate_temp',
  'textured_plate_temp_initial_layer', 'volumetric_speed_coefficients',
]);

// Per-slot arrays that live in the project config rather than in filament presets.
const PROJECT_SLOT_KEYS = new Set<string>([
  'filament_settings_id', 'filament_ids', 'filament_colour', 'filament_multi_colour', 'filament_colour_type',
  'filament_map', 'filament_nozzle_map', 'filament_volume_map',
]);

// Arrays laid out as [process, filament 1..k, printer].
const PRESET_GROUP_KEYS = ['inherits_group', 'different_settings_to_system'];

const MIXED_KEYS = [
  'filament_is_mixed',
  'filament_mixed_components',
  'filament_mixed_sublayer_ratios',
  'filament_mixed_gradient',
  'filament_mixed_gradient_range',
  'filament_mixed_gradient_curve',
  'filament_mixed_gradient_per_part',
] as const;
const MIXED_BOOL_KEYS = new Set<string>(['filament_is_mixed', 'filament_mixed_gradient', 'filament_mixed_gradient_per_part']);

type ConfigValue = string | string[];
export type OrcaProjectConfig = Record<string, ConfigValue>;

export type OrcaTemplate = {
  fileName: string;
  config: OrcaProjectConfig;
  /** `<metadata>` elements of the template's root model; they identify the file as OrcaSlicer's. */
  modelMetadataXml: string;
  slotCount: number;
  version: string | null;
};

export class OrcaTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrcaTemplateError';
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function readMetadataValue(xml: string, name: string): string | null {
  const match = new RegExp(`<metadata\\s+name="${name}"[^>]*>([^<]*)</metadata>`).exec(xml);
  return match ? match[1].trim() : null;
}

export async function readOrcaTemplate(source: Blob | ArrayBuffer | Uint8Array, fileName: string): Promise<OrcaTemplate> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(source);
  } catch {
    throw new OrcaTemplateError(`${fileName} is not a 3MF file.`);
  }

  const configEntry = zip.file(PROJECT_CONFIG_PATH);
  const modelEntry = zip.file(MODEL_PATH);
  if (!configEntry || !modelEntry) {
    throw new OrcaTemplateError(`${fileName} is not an OrcaSlicer project. Save a project from OrcaSlicer (File > Save Project) and use that.`);
  }

  let config: OrcaProjectConfig;
  try {
    config = JSON.parse(await configEntry.async('string'));
  } catch {
    throw new OrcaTemplateError(`${fileName} has an unreadable project config.`);
  }

  const modelXml = await modelEntry.async('string');
  const headEnd = modelXml.indexOf('<resources');
  const head = headEnd >= 0 ? modelXml.slice(0, headEnd) : modelXml;
  // Thumbnails point at images this export doesn't carry, so leave those entries out.
  const modelMetadataXml = (head.match(/<metadata\b[^>]*>[^<]*<\/metadata>/g) ?? [])
    .filter((entry) => !/name="Thumbnail/.test(entry))
    .join('\n  ');

  const version =
    readMetadataValue(head, 'OrcaSlicer') ??
    readMetadataValue(head, 'Application')?.replace(/^OrcaSlicer-/, '') ??
    null;
  if (!/OrcaSlicer/.test(head)) {
    throw new OrcaTemplateError(`${fileName} was not saved by OrcaSlicer.`);
  }
  if (!('filament_is_mixed' in config) && (!version || compareVersions(version, '2.5.0') < 0)) {
    throw new OrcaTemplateError(
      `${fileName} was saved by OrcaSlicer ${version ?? '(unknown version)'}. Mixed filaments need OrcaSlicer 2.5 or newer.`,
    );
  }

  const ids = config.filament_settings_id;
  const slotCount = Array.isArray(ids) ? ids.length : Array.isArray(config.filament_colour) ? config.filament_colour.length : 0;
  if (slotCount === 0) {
    throw new OrcaTemplateError(`${fileName} has no filaments configured.`);
  }
  const mixed = config.filament_is_mixed;
  if (Array.isArray(mixed) && mixed.some((v) => v === '1' || v === 'true')) {
    throw new OrcaTemplateError(`${fileName} already contains mixed filaments. Use a project with only physical filaments.`);
  }

  return { fileName, config, modelMetadataXml, slotCount, version };
}

function isSlotKey(key: string): boolean {
  return FILAMENT_PRESET_KEYS.has(key) || PROJECT_SLOT_KEYS.has(key) || key.startsWith('filament_');
}

function upperHex(color: string): string {
  const hex = color.startsWith('#') ? color : `#${color}`;
  return hex.slice(0, 7).toUpperCase();
}

/**
 * Returns a copy of the template config with the physical colours applied and one mixed slot
 * appended per mix recipe. Mixed slot j gets 1-based slot number `template.slotCount + j + 1`.
 */
export function buildOrcaProjectConfig(template: OrcaTemplate, materials: MaterialRecipe[]): OrcaProjectConfig {
  const physical = materials.filter((m) => !m.components || m.components.length === 0);
  const mixes = materials.filter((m) => m.components && m.components.length > 0);
  const k = template.slotCount;
  const n = k + mixes.length;

  if (physical.length > k) {
    throw new OrcaTemplateError(
      `This shading uses ${physical.length} physical filaments but ${template.fileName} only has ${k}. Add filaments to the Orca project and save it again.`,
    );
  }
  if (n > ORCA_MAX_SLOTS) {
    throw new OrcaTemplateError(`OrcaSlicer supports at most ${ORCA_MAX_SLOTS} filament slots; this needs ${n}. Use fewer shading steps.`);
  }

  const config: OrcaProjectConfig = structuredClone(template.config);
  const sourceSlot = 0;

  // Make sure the mixed-filament arrays exist and cover the physical slots.
  for (const key of MIXED_KEYS) {
    const empty = MIXED_BOOL_KEYS.has(key) ? '0' : '';
    const current = Array.isArray(config[key]) ? (config[key] as string[]) : [];
    config[key] = Array.from({ length: k }, (_, i) => current[i] ?? empty);
  }

  const selfIndex = Array.isArray(config.filament_self_index) ? (config.filament_self_index as string[]) : null;
  const variantLength = selfIndex?.length ?? -1;

  for (const [key, value] of Object.entries(config)) {
    if (!Array.isArray(value) || !isSlotKey(key) || key === 'filament_self_index') continue;

    if (value.length === k) {
      const fill = value[sourceSlot];
      config[key] = [...value, ...Array.from({ length: n - k }, () => fill)];
    } else if (selfIndex && value.length === variantLength && variantLength !== k) {
      // Multi-variant printers store one entry per (filament, nozzle variant), tagged by filament_self_index.
      const sourceEntries = value.filter((_, i) => Number(selfIndex[i]) === sourceSlot + 1);
      const extra: string[] = [];
      for (let j = 0; j < n - k; j += 1) extra.push(...sourceEntries);
      config[key] = [...value, ...extra];
    }
  }

  if (selfIndex && variantLength !== k) {
    const perSlot = selfIndex.filter((v) => Number(v) === sourceSlot + 1).length;
    const extra: string[] = [];
    for (let j = 0; j < n - k; j += 1) for (let r = 0; r < perSlot; r += 1) extra.push(String(k + j + 1));
    config.filament_self_index = [...selfIndex, ...extra];
  } else if (selfIndex) {
    config.filament_self_index = Array.from({ length: n }, (_, i) => String(i + 1));
  }

  for (const key of PRESET_GROUP_KEYS) {
    const value = config[key];
    if (Array.isArray(value) && value.length === k + 2) {
      const fill = value[1 + sourceSlot];
      config[key] = [...value.slice(0, k + 1), ...Array.from({ length: n - k }, () => fill), value[k + 1]];
    }
  }

  resizeFlushMatrix(config, k, n, sourceSlot);

  const colour = config.filament_colour as string[];
  const multi = Array.isArray(config.filament_multi_colour) ? (config.filament_multi_colour as string[]) : null;
  const setColour = (slot: number, hex: string) => {
    colour[slot] = upperHex(hex);
    if (multi) multi[slot] = upperHex(hex);
  };

  physical.forEach((material, i) => setColour(i, material.color));

  mixes.forEach((mix, j) => {
    const slot = k + j;
    setColour(slot, mix.color);
    const components = mix.components!.filter((c) => c.ratio > 0);
    const total = components.reduce((sum, c) => sum + c.ratio, 0) || 1;
    (config.filament_is_mixed as string[])[slot] = '1';
    (config.filament_mixed_components as string[])[slot] = components.map((c) => String(c.extruderId)).join(',');
    (config.filament_mixed_sublayer_ratios as string[])[slot] = components.map((c) => (c.ratio / total).toFixed(4)).join(',');
    (config.filament_mixed_gradient as string[])[slot] = '0';
    (config.filament_mixed_gradient_range as string[])[slot] = '';
    (config.filament_mixed_gradient_curve as string[])[slot] = '';
    (config.filament_mixed_gradient_per_part as string[])[slot] = '0';
  });

  return config;
}

// flush_volumes_matrix holds one k*k block per extruder. Grow each block to n*n, copying the
// source slot's row/column; Orca resolves mixed slots to their components before purging anyway.
function resizeFlushMatrix(config: OrcaProjectConfig, k: number, n: number, sourceSlot: number): void {
  const matrix = config.flush_volumes_matrix;
  if (!Array.isArray(matrix) || matrix.length === 0 || matrix.length % (k * k) !== 0) return;
  const blocks = matrix.length / (k * k);
  const out: string[] = [];
  for (let b = 0; b < blocks; b += 1) {
    const at = (row: number, col: number) => matrix[b * k * k + row * k + col];
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        const r = row < k ? row : sourceSlot;
        const c = col < k ? col : sourceSlot;
        out.push(r === c && row !== col ? '0' : at(r, c));
      }
    }
  }
  config.flush_volumes_matrix = out;
}

/** Paint state Orca expects for a ColorMix material index (states are 1-based filament slots). */
export function orcaSlotForMaterial(materials: MaterialRecipe[], templateSlotCount: number): number[] {
  let mixIndex = 0;
  let physicalIndex = 0;
  return materials.map((m) => {
    if (m.components && m.components.length > 0) {
      mixIndex += 1;
      return templateSlotCount + mixIndex;
    }
    physicalIndex += 1;
    return physicalIndex;
  });
}
