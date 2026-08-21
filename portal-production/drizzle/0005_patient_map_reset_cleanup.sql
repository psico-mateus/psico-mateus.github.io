-- Versões anteriores da limpeza avançavam a geração do estado, mas mantinham
-- respostas, sínteses, posições e tombstones de gerações já inacessíveis.
-- Remover somente linhas que não pertencem à geração atual preserva todo o
-- rascunho visível e elimina apenas conteúdo que o próprio produto já tratava
-- como apagado.
DELETE FROM `patient_map_draft_fields`
WHERE `field_type` <> 'state'
  AND EXISTS (
    SELECT 1
    FROM `patient_map_draft_fields` AS `state`
    WHERE `state`.`patient_id` = `patient_map_draft_fields`.`patient_id`
      AND `state`.`content_version` = `patient_map_draft_fields`.`content_version`
      AND `state`.`field_type` = 'state'
      AND `state`.`field_id` = '__state__'
      AND `state`.`generation` <> `patient_map_draft_fields`.`generation`
  );
