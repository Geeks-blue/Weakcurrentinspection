-- PostgreSQL v16 schema draft for MVP

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('student','teacher','maintainer','admin')),
    gender VARCHAR(8) CHECK (gender IN ('male','female')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE buildings (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL,
    gender_restriction VARCHAR(16) NOT NULL DEFAULT 'none' CHECK (gender_restriction IN ('none','female_only')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rooms (
    id BIGSERIAL PRIMARY KEY,
    room_code VARCHAR(64) UNIQUE NOT NULL,
    building_id BIGINT NOT NULL REFERENCES buildings(id),
    floor_label VARCHAR(32),
    location_text VARCHAR(255),
    qr_token VARCHAR(128) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assets (
    id BIGSERIAL PRIMARY KEY,
    asset_no VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    asset_type VARCHAR(64) NOT NULL,
    brand_model VARCHAR(128),
    serial_no VARCHAR(128),
    install_date DATE,
    room_id BIGINT NOT NULL REFERENCES rooms(id),
    owner_user_id BIGINT REFERENCES users(id),
    status VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','fault','repairing','retired','unknown')),
    extra_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_status_logs (
    id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES assets(id),
    old_status VARCHAR(16),
    new_status VARCHAR(16) NOT NULL,
    reason TEXT,
    operator_user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    cycle_type VARCHAR(16) NOT NULL CHECK (cycle_type IN ('one_off','weekly','monthly')),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','deleted')),
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_assignments (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES inspection_tasks(id),
    room_id BIGINT NOT NULL REFERENCES rooms(id),
    student_user_id BIGINT NOT NULL REFERENCES users(id),
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','submitted','approved','rejected','rectify_required','overdue','closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, room_id, student_user_id)
);

CREATE TABLE inspections (
    id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES task_assignments(id),
    room_id BIGINT NOT NULL REFERENCES rooms(id),
    inspector_user_id BIGINT NOT NULL REFERENCES users(id),
    checkin_mode VARCHAR(16) NOT NULL CHECK (checkin_mode IN ('qr','manual')),
    checkin_lat DOUBLE PRECISION,
    checkin_lng DOUBLE PRECISION,
    lock_state VARCHAR(16) NOT NULL CHECK (lock_state IN ('locked','unlocked','lock_damaged')),
    clutter_state VARCHAR(16) NOT NULL CHECK (clutter_state IN ('none','stacked_items','water','odor')),
    indicator_state VARCHAR(16) NOT NULL CHECK (indicator_state IN ('all_ok','partial_abnormal','all_abnormal')),
    asset_match_state VARCHAR(16) NOT NULL CHECK (asset_match_state IN ('matched','missing','extra','moved')),
    remark_text TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','rectify_required')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewer_user_id BIGINT REFERENCES users(id)
);

CREATE TABLE inspection_photos (
    id BIGSERIAL PRIMARY KEY,
    inspection_id BIGINT NOT NULL REFERENCES inspections(id),
    object_key VARCHAR(255) NOT NULL,
    watermark_json JSONB NOT NULL,
    taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_compare_reports (
    id BIGSERIAL PRIMARY KEY,
    inspection_id BIGINT NOT NULL REFERENCES inspections(id),
    baseline_inspection_id BIGINT REFERENCES inspections(id),
    clutter_result JSONB,
    asset_change_result JSONB,
    nlp_risk_result JSONB,
    confidence NUMERIC(5,4),
    is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    corrected_by BIGINT REFERENCES users(id),
    correction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workorders (
    id BIGSERIAL PRIMARY KEY,
    inspection_id BIGINT NOT NULL REFERENCES inspections(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_user_id BIGINT REFERENCES users(id),
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    channel VARCHAR(16) NOT NULL CHECK (channel IN ('in_app','sms','wecom','dingtalk','browser_push')),
    event_type VARCHAR(64) NOT NULL,
    payload_json JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- IMPORTANT:
-- Female-dorm hard rule should be enforced in backend policy layer for all read/write APIs.
-- Also add DB-level trigger checks for assignment and submission as defense-in-depth.
