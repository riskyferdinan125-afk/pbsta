export const categoryWeights: Record<string, number> = {
  'PROJECT': 5,
  'REGULER': 2,
  'PSB': 3,
  'SQM': 3,
  'UNSPEKS': 4,
  'EXBIS': 4,
  'CORRECTIVE': 4,
  'PREVENTIVE': 3,
  'Other': 1
};

export const projectSubCategoryWeights: Record<string, number> = {
  'DISTRIBUSI': 4,
  'FEEDER': 10,
  'ODC': 18,
  'ODP': 3
};

export const regulerSubCategoryWeights: Record<string, number> = {
  'PLATINUM': 2,
  'DIAMOND': 2,
  'VVIP': 2,
  'GOLD': 2,
  'REGULER': 2,
  'HVC PLATINUM': 2,
  'HVC GOLD': 2,
  'HVC DIAMOND': 2,
  'NON HVC': 2
};

export const psbSubCategoryWeights: Record<string, number> = {
  'MyRep': 2,
  'TBG': 2,
  '5 MENARA BINTANG': 2,
  'Hypemet': 2,
  'Surge': 4,
  'IBU - FTTR': 5,
  'PT Anagata Cipta Teknologi': 8,
  'Datin': 6.4,
  'Olo': 6.4,
  'Wifi': 5.3
};

export const sqmSubCategoryWeights: Record<string, number> = {
  'WorkHours': 2,
  'NonWorkHours': 2
};

export const unspeksSubCategoryWeights: Record<string, number> = {
  'Datin': 2.67,
  'HSI': 2,
  'Wifi': 2.67
};

export const exbisSubCategoryWeights: Record<string, number> = {
  'TIS': 8,
  'Lintasarta': 8,
  'Mitratel': 8,
  'Surge': 8,
  'Centratama': 8,
  'UMT': 8
};

export const correctiveSubCategoryWeights: Record<string, number> = {
  'CSA': 4,
  'MMP': 4,
  'TBG': 4,
  'TIS': 4,
  'Polaris': 4,
  'Mitratel': 4,
  'Digiserve': 4,
  'Cross Connect TDE': 4,
  'IBU - FTTR': 5,
  'Nutech': 4,
  'SNT': 4,
  'SPBU': 4,
  'Surge': 4,
  'MyRep': 2,
  'Asianet': 4,
  'Centratama': 4,
  'Lintasarta': 4,
  'UMT': 4
};

export const preventiveSubCategoryWeights: Record<string, number> = {
  'MMP': 2,
  'CSA': 2,
  'TBG': 2,
  'Polaris': 2,
  'TIS': 2,
  'Fiberisasi': 2,
  'Digiserve': 4,
  'Cross Connect TDE': 4,
  'IBU - FTTR': 5,
  'NuTech': 4,
  'SNT': 4,
  'SPBU': 4,
  'Surge': 4,
  'Asianet': 2,
  'Centratama': 8,
  'Lintasarta': 2,
  'UMT': 2
};

export const specificCategoryWeights: Record<string, number> = {
  'Corective CSA': 4,
  'Corective MMP': 4,
  'Corective TBG': 4,
  'Corective Power Polaris': 4,
  'Corective Tiwer TIS': 4,
  'Preventive MMP': 2,
  'Preventive CSA': 2,
  'Preventive TBG': 2,
  'Preventive Power Polaris': 2,
  'Preventive Power TIS': 2,
  'Corrective Mitratel': 4,
  'Preventive Fiberisasi': 2,
  'Aktivasi / Migrasi / Dismantel Digiserve': 4,
  'Corrective Digiserve': 4,
  'Relokasi Digiserve': 1,
  'Aktivasi Cross Connect TDE': 4,
  'Corrective Ibu - FTTR': 5,
  'Corrective NuTech': 4,
  'Corrective SNT': 4,
  'Corrective SPBU': 4,
  'Corrective Surge': 4,
  'Inventory SPBU': 4,
  'MS IT & FO SJU': 5,
  'MS Patroli Tellin': 4,
  'Preventive MS SNT': 2,
  'Preventive NuTech': 4,
  'Preventive SPBU': 8,
  'Relokasi DCS': 1,
  'SPPG': 8,
  'Corrective MyRep': 2,
  'Preventive Asianet': 2,
  'HSI Indihome Reseller': 2,
  'Tangible': 4,
  'Tiket Datin Kategory 1': 3,
  'Tiket Datin Kategory 2': 3,
  'Tiket Datin Kategory 3': 3,
  'Tiket HSI Indibiz': 2,
  'Tiket Node B CNQ (Preventive/Quality)': 4,
  'Tiket Node B Critical': 6,
  'Tiket Node B Low': 4,
  'Tiket Node B Minor': 4,
  'Tiket Node B Major': 4,
  'Tiket Node B Premium': 6,
  'Tiket Node B Premium Preventive': 4,
  'Tiket OLO Datin Gamas': 4,
  'Tiket OLO Datin Non Gamas': 4,
  'Tiket OLO Datin Quality': 4,
  'Tiket OLO SL WDM': 4,
  'Tiket OLO SL WDM Quality': 4,
  'Tiket Pra SQM Gaul HSI': 2,
  'Tiket SIP Trunk': 3,
  'Tiket SQM Datin': 3,
  'Tiket SQM HSI': 2,
  'Tiket Wifi Id': 3,
  'Tiket Wifi Logic': 3,
  'Unspec Datin': 3,
  'Unspec HSI': 2,
  'Unspec Site': 4,
  'Unspec Wifi': 2,
  'Validasi Data Ebis': 2,
  'Validasi Data Wifi': 2,
  'Validasi Sewa Tiang': 0.25,
};

export const calculateTicketPoints = (category: string, subCategory?: string): number => {
  // Priority 1: Specific Category Weights (matches subCategory exactly)
  if (subCategory && specificCategoryWeights[subCategory]) {
    return specificCategoryWeights[subCategory];
  }

  // Priority 2: Existing logic
  let points = categoryWeights[category] || 1;
  
  if (category === 'PROJECT' && subCategory && projectSubCategoryWeights[subCategory]) {
    points = projectSubCategoryWeights[subCategory];
  } else if (category === 'REGULER' && subCategory && regulerSubCategoryWeights[subCategory]) {
    points = regulerSubCategoryWeights[subCategory];
  } else if (category === 'PSB' && subCategory && psbSubCategoryWeights[subCategory]) {
    points = psbSubCategoryWeights[subCategory];
  } else if (category === 'SQM' && subCategory && sqmSubCategoryWeights[subCategory]) {
    points = sqmSubCategoryWeights[subCategory];
  } else if (category === 'UNSPEKS' && subCategory && unspeksSubCategoryWeights[subCategory]) {
    points = unspeksSubCategoryWeights[subCategory];
  } else if (category === 'EXBIS' && subCategory && exbisSubCategoryWeights[subCategory]) {
    points = exbisSubCategoryWeights[subCategory];
  } else if (category === 'CORRECTIVE' && subCategory && correctiveSubCategoryWeights[subCategory]) {
    points = correctiveSubCategoryWeights[subCategory];
  } else if (category === 'PREVENTIVE' && subCategory && preventiveSubCategoryWeights[subCategory]) {
    points = preventiveSubCategoryWeights[subCategory];
  }
  
  return points;
};
