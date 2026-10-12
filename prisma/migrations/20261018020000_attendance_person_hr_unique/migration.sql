-- One attendance person per HR employee (NULLs stay distinct).
CREATE UNIQUE INDEX "att_person_company_id_hr_employee_id_key" ON "att_person"("company_id", "hr_employee_id");
