// 國策：開局選定一種施政流派，每月提供固定修正。流派為 Phase 3 暫定設計。

export const POLICIES = {
  agrarian: {
    name: '重農',
    monthly: { agriculture: 0.5, people: 0.1 },
    warStrength: 1.0,
  },
  commerce: {
    name: '重商',
    monthly: { commerce: 0.8, treasury: 5, people: -0.1 },
    warStrength: 1.0,
  },
  militarist: {
    name: '黷武',
    monthly: { armament: 1, people: -0.2 },
    warStrength: 1.1,
  },
  confucian: {
    name: '儒術',
    monthly: { benevolence: 0.5, heaven: 0.05 },
    warStrength: 0.9,
  },
};

export const POLICY_KEYS = Object.keys(POLICIES);
