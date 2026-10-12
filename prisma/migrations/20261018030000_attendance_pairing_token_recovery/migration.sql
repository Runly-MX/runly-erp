-- Pairing hand-off survives a lost response: token sealed with the poll secret until first authenticated call.
ALTER TABLE "att_kiosk" ADD COLUMN "pairing_token_enc" TEXT;
