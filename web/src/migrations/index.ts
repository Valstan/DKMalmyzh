import * as migration_20260621_145321_initial from './20260621_145321_initial';
import * as migration_20260831_175113_institutions from './20260831_175113_institutions';
import * as migration_20260831_184647_vk_import from './20260831_184647_vk_import';
import * as migration_20260901_063625_vk_sources from './20260901_063625_vk_sources';

export const migrations = [
  {
    up: migration_20260621_145321_initial.up,
    down: migration_20260621_145321_initial.down,
    name: '20260621_145321_initial',
  },
  {
    up: migration_20260831_175113_institutions.up,
    down: migration_20260831_175113_institutions.down,
    name: '20260831_175113_institutions',
  },
  {
    up: migration_20260831_184647_vk_import.up,
    down: migration_20260831_184647_vk_import.down,
    name: '20260831_184647_vk_import',
  },
  {
    up: migration_20260901_063625_vk_sources.up,
    down: migration_20260901_063625_vk_sources.down,
    name: '20260901_063625_vk_sources'
  },
];
