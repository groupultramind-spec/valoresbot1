/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// CPF Validation Algorithm
export const validateCPF = (cpf: string) => {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleanCPF)) return false;

  let sum = 0;
  let rev;
  for (let i = 0; i < 9; i++) sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCPF.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleanCPF.charAt(10))) return false;

  return true;
};

// CNPJ Validation Algorithm
export const validateCNPJ = (cnpj: string) => {
  const b = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const c = cnpj.replace(/[^\d]/g, "");

  if (c.length !== 14) return false;
  if (/0{14}/.test(c)) return false;

  let n = 0;
  for (let i = 0; i < 12; i++) n += parseInt(c[i]) * b[i + 1];
  let r = n % 11;
  if (parseInt(c[12]) !== (r < 2 ? 0 : 11 - r)) return false;

  n = 0;
  for (let i = 0; i <= 12; i++) n += parseInt(c[i]) * b[i];
  r = n % 11;
  if (parseInt(c[13]) !== (r < 2 ? 0 : 11 - r)) return false;

  return true;
};
