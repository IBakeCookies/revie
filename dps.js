function getDps(critRate, critDmg) {
	return 1 + (critRate / 100) * (critDmg / 100 - 1);
}

const phrolova = getDps(95.4, 254);
const augusta = getDps(67.4, 261.8);
const camella = getDps(72.6, 245.8);
const carlotta = getDps(68, 278.4);
const cartethyia = getDps(76.1, 264.8);
const jinhsi = getDps(76.6, 250.4);
const jiyan = getDps(66.8, 227.4);

console.log({
	phrolova,
	augusta,
	camella,
	carlotta,
	cartethyia,
	jinhsi,
	jiyan
});
