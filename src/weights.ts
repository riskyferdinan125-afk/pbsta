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

export const calculateTicketPoints = (category: string, subCategory?: string): number => {
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
