type SemanticColor = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';
type ColorVariant = 'light' | 'dark';
type StyleType = 'solid' | 'outline';

interface ColorStyle {
	background: string;
	title: string;
	body: string;
	border: string;
	hoverBackground: string;
	hoverText?: string;
}

type ColorConfig = Record<SemanticColor, Record<ColorVariant, Record<StyleType, ColorStyle>>>;

const separator = '-';

export type StylePath =
	`${SemanticColor}${typeof separator}${ColorVariant}${typeof separator}${StyleType}`;

const lightText = {
	title: 'text-stone-100',
	body: 'text-stone-200'
};

const colorConfig: ColorConfig = {
	primary: {
		light: {
			solid: {
				background: 'bg-primary',
				title: 'text-primary-foreground',
				body: 'text-primary-foreground',
				border: '',
				hoverBackground: '',
				hoverText: ''
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white'
				};
			}
		},
		dark: {
			solid: {
				...lightText,
				background: 'bg-primary',
				border: '',
				hoverBackground: ''
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white',
					title: '',
					body: '',
					hoverText: ''
				};
			}
		}
	},
	neutral: {
		light: {
			solid: {
				background: 'bg-stone-100',
				title: 'text-stone-700',
				body: 'text-stone-900',
				border: 'border-stone-200',
				hoverBackground: 'hover:bg-stone-200'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white'
				};
			}
		},
		dark: {
			solid: {
				...lightText,
				background: 'bg-stone-800',
				border: 'border-stone-950',
				hoverBackground: 'hover:bg-stone-950'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white',
					title: 'text-stone-700',
					body: 'text-stone-900',
					hoverText: 'hover:text-stone-100'
				};
			}
		}
	},
	info: {
		light: {
			solid: {
				background: 'bg-blue-100',
				title: 'text-blue-700',
				body: 'text-blue-900',
				border: 'border-blue-200',
				hoverBackground: 'hover:bg-blue-200',
				hoverText: 'hover:text-blue-900'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white'
				};
			}
		},
		dark: {
			solid: {
				...lightText,
				background: 'bg-blue-600',
				border: 'border-blue-700',
				hoverBackground: 'hover:bg-blue-700'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white',
					title: 'text-blue-700',
					body: 'text-blue-700',
					hoverText: 'hover:text-stone-100'
				};
			}
		}
	},
	success: {
		light: {
			solid: {
				background: 'bg-emerald-100',
				title: 'text-emerald-700',
				body: 'text-emerald-900',
				border: 'border-emerald-200',
				hoverBackground: 'hover:bg-emerald-200',
				hoverText: 'hover:text-emerald-900'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white'
				};
			}
		},
		dark: {
			solid: {
				...lightText,
				background: 'bg-emerald-600',
				border: 'border-emerald-700',
				hoverBackground: 'hover:bg-emerald-700'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white',
					title: 'text-emerald-700',
					body: 'text-emerald-700',
					hoverText: 'hover:text-stone-100'
				};
			}
		}
	},
	danger: {
		light: {
			solid: {
				background: 'bg-red-100',
				title: 'text-red-700',
				body: 'text-red-900',
				border: 'border-red-200',
				hoverBackground: 'hover:bg-red-200',
				hoverText: 'hover:text-red-900'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white'
				};
			}
		},
		dark: {
			solid: {
				...lightText,
				background: 'bg-red-600',
				border: 'border-red-700',
				hoverBackground: 'hover:bg-red-700'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white',
					title: 'text-red-700',
					body: 'text-red-700',
					hoverText: 'hover:text-stone-100'
				};
			}
		}
	},
	warning: {
		light: {
			solid: {
				background: 'bg-amber-100',
				title: 'text-amber-700',
				body: 'text-amber-900',
				border: 'border-amber-200',
				hoverBackground: 'hover:bg-amber-200',
				hoverText: 'hover:text-amber-900'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white'
				};
			}
		},
		dark: {
			solid: {
				...lightText,
				background: 'bg-amber-600',
				border: 'border-amber-700',
				hoverBackground: 'hover:bg-amber-700'
			},
			get outline() {
				return {
					...this.solid,
					background: 'bg-white',
					title: 'text-amber-700',
					body: 'text-amber-700',
					hoverText: 'hover:text-stone-100'
				};
			}
		}
	}
};

function getStateVariantStyle(path: StylePath): ColorStyle {
	const [color, variant, type] = path.split(separator) as [
		SemanticColor,
		ColorVariant,
		StyleType
	];

	return colorConfig[color][variant][type];
}

export function getAlertVariantStyle(path: StylePath): string {
	const { background, title, border } = getStateVariantStyle(path);

	return `${background} ${title} ${border}`;
}

export function getButtonVariantStyle(path: StylePath): string {
	const { background, title, border, hoverText, hoverBackground } = getStateVariantStyle(path);

	if (path.includes('outline')) {
		return `${background} ${title} ${border} ${hoverText} ${hoverBackground}`;
	}

	return `${background} ${title} ${hoverBackground}`;
}

export function getNotificationVariantStyle(path: StylePath): Pick<ColorStyle, 'title' | 'body'> {
	const { title, body } = getStateVariantStyle(path);

	return {
		title,
		body
	};
}
