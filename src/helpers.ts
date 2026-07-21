export function colorByFolderName(name: string) {
    const colorMap = {
        '1st year': '#00BCD4',
        '2nd year': '#FF9800',
        '3rd year': '#795548',
        '4th year': '#9C27B0',
        '5th year': '#4CAF50',
        '6th year': '#E91E63',
        'NLE1': '#607D8B',
        'NLE2': '#FDD835'
    };
    return colorMap[name] || 'gray';
}

export function colorByFolderNamePink(name: string) {
    const colorMap = {
        '1st year': '#F48FB1',
        '2nd year': '#E91E90',
        '3rd year': '#AD1457',
        '4th year': '#C2185B',
        '5th year': '#D81B60',
        '6th year': '#880E4F',
        'NLE1': '#EC407A',
        'NLE2': '#F06292'
    };
    return colorMap[name] || '#B07090';
}

