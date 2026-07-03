-- ============================================================
-- 0021: 프로젝트 생성 저장 에러 원천 차단
--   projects INSERT 시 enqueue_erp_sync('project')가 (projects엔 없는)
--   project_id를 참조해 "record v_row has no field project_id" 에러 발생.
--   프로젝트 단위 ERP 아웃박스는 비필수이므로 트리거 제거.
--   (0018에서 함수는 이미 id 사용으로 수정, 여기서 트리거 자체 제거)
-- ============================================================
drop trigger if exists trg_erp_sync_project on public.projects;
