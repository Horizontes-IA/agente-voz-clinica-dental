CREATE TRIGGER operation_commit_guard BEFORE UPDATE OF state ON operations WHEN NEW.state='committing' AND OLD.state='prepared' BEGIN
 SELECT RAISE(ABORT,'OPERATION_EXPIRED') WHERE OLD.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now');
 SELECT RAISE(ABORT,'APPOINTMENT_CHANGED') WHERE OLD.appointment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id=OLD.appointment_id AND a.patient_id=OLD.patient_id AND a.version=OLD.original_version AND a.status IN ('booked','confirmed'));
END;
