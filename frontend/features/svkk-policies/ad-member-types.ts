export type AdMemberRow = {
  name: string;
  relationship: string;
  dob: string;
  age: string;
  dateOfJoining: string;
  sumInsured: string;
  cumulativeBonus: string;
  phNo: string;
  basicPremium: string;
  gender: string;
};

export function emptyMemberRow(): AdMemberRow {
  return {
    name: "",
    relationship: "",
    dob: "",
    age: "",
    dateOfJoining: "",
    sumInsured: "",
    cumulativeBonus: "",
    phNo: "",
    basicPremium: "",
    gender: "M",
  };
}
