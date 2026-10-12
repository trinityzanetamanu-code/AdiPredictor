# Python to Kotlin coverage

Source: `d22097ffc4772d0436b4deb9bb647a82c77ffed1`, `scripts/prediction_engine.py`.

All prediction, backtest, audit, visual and history calculations are independent Kotlin. Files, archives and the clock enter through the CLI adapter; the core only returns values/SVG text. Stage 3B production file lifecycle is Kotlin; Git orchestration is shell and collector/backfill remain Python.

| Python function | Kotlin implementation | Location / boundary |
|---|---|---|
| `rate` | `rate` | Contracts.kt |
| `rnd` | `rnd` | Contracts.kt |
| `digits_of` | `Draw.digits / numberOf` | core / CLI boundary |
| `number_of` | `Draw.number / numberOf` | Contracts.kt |
| `load_config` | `CLI readJson (explicit --config)` | core / CLI boundary |
| `load_history` | `CLI history` | core / CLI boundary |
| `market_weekdays` | `marketWeekdays` | Contracts.kt |
| `target_date_for` | `targetDateFor` | Contracts.kt |
| `increment_period` | `incrementPeriod` | Contracts.kt |
| `dataset_fingerprint` | `datasetFingerprint` | Contracts.kt |
| `dataset_revision` | `datasetRevision` | Contracts.kt |
| `validate_dataset` | `validateDataset` | Contracts.kt |
| `normalize` | `normalize` | Contracts.kt |
| `normalize_matrix` | `normalizeMatrix` | Contracts.kt |
| `top_digits` | `topDigits` | Contracts.kt |
| `aggregate` | `aggregate` | Contracts.kt |
| `position_frequency` | `positionFrequency` | Contracts.kt |
| `global_frequency` | `globalFrequency` | Contracts.kt |
| `raw_positions` | `rawPositions` | Contracts.kt |
| `pair_counts` | `pairCounts` | Contracts.kt |
| `cooccurrence` | `cooccurrence` | Contracts.kt |
| `wilson_interval` | `wilsonInterval` | Contracts.kt |
| `model_p1` | `modelP1` | Models.kt |
| `digit_gaps` | `digitGaps` | Models.kt |
| `model_p2` | `modelP2` | Models.kt |
| `transition_tables` | `transitionTables` | Models.kt |
| `model_p3` | `modelP3` | Models.kt |
| `duplicate_class` | `duplicateClass` | Models.kt |
| `duplicate_diagnostics` | `duplicateDiagnostics` | Models.kt |
| `model_p4` | `modelP4` | Models.kt |
| `visual_backtests` | `visualBacktests` | Models.kt |
| `visual_only_edge` | `visualOnlyEdge` | Models.kt |
| `model_p5` | `modelP5` | Models.kt |
| `structure_signature` | `structureSignature` | Models.kt |
| `structural_diagnostics` | `structuralDiagnostics` | Models.kt |
| `model_p6` | `modelP6` | Models.kt |
| `lag_diagnostics` | `lagDiagnostics` | Models.kt |
| `model_p7` | `modelP7` | Models.kt |
| `model_matrix` | `modelMatrix` | Models.kt |
| `ranked_combinations` | `rankedCombinations` | Models.kt |
| `exactly_one_pair` | `exactlyOnePair` | Models.kt |
| `specialized_single_pairs` | `specializedSinglePairs` | Models.kt |
| `topk_summary` | `topkSummary` | Models.kt |
| `empty_walk_forward` | `WalkStats constructor` | core / CLI boundary |
| `evaluate_prediction` | `evaluatePrediction` | Consensus.kt |
| `finalize_walk_forward` | `finalizeWalkForward` | Consensus.kt |
| `walk_forward_reliability` | `walkForwardReliability` | Consensus.kt |
| `p8_instinct` | `p8Instinct` | Consensus.kt |
| `exact_support` | `exactSupport` | Consensus.kt |
| `stars_for` | `starsFor` | Consensus.kt |
| `candidate_record` | `candidateRecord` | Consensus.kt |
| `consensus_candidates` | `consensusCandidates` | Consensus.kt |
| `digit_consensus` | `digitConsensus` | Consensus.kt |
| `diversity_metrics` | `diversityMetrics` | Consensus.kt |
| `select_four_d` | `selectFourD` | Consensus.kt |
| `kembar_backtest` | `kembarBacktest` | Consensus.kt |
| `select_kembar` | `selectKembar` | Consensus.kt |
| `extract_number` | `extractNumber` | Audits.kt |
| `audit_match` | `auditMatch` | Audits.kt |
| `audit_list` | `auditList` | Audits.kt |
| `bbfs_audit` | `bbfsAudit` | Audits.kt |
| `repeat_signal_audit` | `repeatSignalAudit` | Audits.kt |
| `kembar_candidate_audit` | `kembarCandidateAudit` | Audits.kt |
| `compact_audit_snapshot` | `compactAuditSnapshot` | Audits.kt |
| `model_outcome_audit` | `modelOutcomeAudit` | Audits.kt |
| `p8_outcome_audit` | `p8OutcomeAudit` | Audits.kt |
| `visual_outcome_audit` | `visualOutcomeAudit` | Audits.kt |
| `audit_prediction_payload` | `auditPredictionPayload` | Audits.kt |
| `prior_audit` | `buildPrediction + PredictionInputs.priorArchive` | core / CLI boundary |
| `visual_occurrences` | `visualOccurrences` | Visuals.kt |
| `render_svg` | `renderSvg` | Visuals.kt |
| `visual_pattern_backtest` | `visualPatternBacktest` | Visuals.kt |
| `visual_target_signal` | `visualTargetSignal` | Visuals.kt |
| `generate_visual_patterns` | `generateVisualPatterns` | Visuals.kt |
| `_candidate_number` | `extractNumber` | core / CLI boundary |
| `prediction_sections` | `predictionSections` | Prediction.kt |
| `build_prediction` | `buildPrediction` | Prediction.kt |
| `write_prediction` | `ProductionAdapter.writePrediction` / shadow `writeNew` | production preserves native skip/archive policy; shadow remains fresh output only |
| `history_hit_summary` | `historyHitSummary` | Audits.kt |
| `history_record` | `historyRecord` | Audits.kt |
| `update_history_index` | `historyIndex + ProductionAdapter.index` / shadow archive reader | core computation; adapter writes only changed history bytes |
| `run` | `ProductionAdapter.run` / shadow batch | isolated staging, previous selection, skip/status, validation and transaction; shell publisher |
| `main` | `production.MainKt` / shadow `MainKt` | separate bounded production and guarded shadow entry points |
