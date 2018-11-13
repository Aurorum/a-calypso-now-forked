/** @format */

/**
 * External dependencies
 */
import { __, _n } from 'gutenberg/extensions/presets/jetpack/utils/i18n';
import { Component, Fragment } from '@wordpress/element';
import { compose, withInstanceId } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/editor';
import { sprintf } from '@wordpress/i18n';
import { dispatch, withSelect } from '@wordpress/data';
import {
	ExternalLink,
	PanelBody,
	SelectControl,
	TextareaControl,
	TextControl,
	ToggleControl,
} from '@wordpress/components';
import classNames from 'classnames';
import emailValidator from 'email-validator';
import trimEnd from 'lodash/trimEnd';
import { isNull, memoize } from 'lodash';
import debugFactory from 'debug';

/**
 * Internal dependencies
 */
import { getCurrencyDefaults } from 'lib/format-currency/currencies';
import {
	SIMPLE_PAYMENTS_PRODUCT_POST_TYPE,
	SUPPORTED_CURRENCY_LIST,
} from 'lib/simple-payments/constants';
import ProductPlaceholder from './product-placeholder';
import HelpMessage from './help-message';
import makeJsonSchemaParser from 'lib/make-json-schema-parser';

const debug = debugFactory( 'jetpack-blocks:simple-payments:edit' );

class SimplePaymentsEdit extends Component {
	state = {
		fieldEmailError: null,
		fieldPriceError: null,
		fieldTitleError: null,
		isSavingProduct: false,
	};

	componentDidMount() {
		this.injectPaymentAttributes();
	}

	componentDidUpdate( prevProps ) {
		const { isSelected } = this.props;

		if ( prevProps.isLoadingInitial !== this.props.isLoadingInitial ) {
			debug(
				'isLoadingInitial changed: %o; simplePayment: %o',
				this.props.isLoadingInitial,
				this.props.simplePayment
			);
		}

		if ( prevProps.simplePayment !== this.props.simplePayment ) {
			debug( '%o !== %o', prevProps.simplePayment, this.props.simplePayment );
			this.injectPaymentAttributes();
		}

		// Validate and save on block-deselect
		if ( prevProps.isSelected && ! isSelected ) {
			this.saveProduct();
		}
	}

	injectPaymentAttributes() {
		const { setAttributes, simplePayment } = this.props;

		if ( simplePayment ) {
			setAttributes( {
				content: simplePayment.content,
				currency: simplePayment.currency,
				email: simplePayment.email,
				multiple: simplePayment.multiple,
				price: simplePayment.price,
				title: simplePayment.title,
			} );
		}
	}

	attributesToPost = attributes => {
		const { content, currency, email, multiple, paymentId, price, title } = attributes;

		return {
			id: paymentId,
			content,
			featured_media: 0,
			meta: {
				spay_currency: currency,
				spay_email: email,
				spay_multiple: multiple ? 1 : 0,
				spay_price: price,
			},
			status: 'publish',
			title,
		};
	};

	saveProduct() {
		if ( this.state.isSavingProduct ) {
			return;
		}

		if ( ! this.validateAttributes() ) {
			return;
		}

		const { attributes, setAttributes } = this.props;
		const { email } = attributes;
		const { saveEntityRecord } = dispatch( 'core' );

		this.setState( { isSavingProduct: true }, async () => {
			saveEntityRecord(
				'postType',
				SIMPLE_PAYMENTS_PRODUCT_POST_TYPE,
				this.attributesToPost( attributes )
			)
				.then( record => {
					debug( 'Saved: %o', record );
					setAttributes( { paymentId: record.id } );
				} )
				.catch( error => {
					// @TODO: complete error handling
					debug( error );

					const {
						data: { key: apiErrorKey },
					} = error;

					// @TODO errors in other fields
					this.setState( {
						fieldEmailError:
							apiErrorKey === 'spay_email'
								? sprintf( __( '%s is not a valid email address.' ), email )
								: null,
						fieldPriceError: apiErrorKey === 'spay_price' ? __( 'Invalid price.' ) : null,
					} );
				} )
				.finally( () => {
					this.setState( {
						isSavingProduct: false,
					} );
				} );
		} );
	}

	// based on https://stackoverflow.com/a/10454560/59752
	decimalPlaces = number => {
		const match = ( '' + number ).match( /(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/ );
		if ( ! match ) {
			return 0;
		}
		return Math.max( 0, ( match[ 1 ] ? match[ 1 ].length : 0 ) - ( match[ 2 ] ? +match[ 2 ] : 0 ) );
	};

	validateAttributes = () => {
		const isPriceValid = this.validatePrice();
		const isTitleValid = this.validateTitle();
		const isEmailValid = this.validateEmail();
		const isCurrencyValid = this.validateCurrency();

		return isPriceValid && isTitleValid && isEmailValid && isCurrencyValid;
	};

	/**
	 * Validate currency
	 *
	 * This method does not include validation UI. Currency selection should not allow for invalid
	 * values. It is primarily to ensure that the currency is valid to save.
	 *
	 * @return  {boolean} True if currency is valid
	 */
	validateCurrency = () => {
		const { currency } = this.props.attributes;
		return SUPPORTED_CURRENCY_LIST.includes( currency );
	};

	/**
	 * Validate price
	 *
	 * Stores error message in state.fieldPriceError
	 *
	 * @returns {Boolean} True when valid, false when invalid
	 */
	validatePrice = () => {
		const { currency, price } = this.props.attributes;
		const { precision } = getCurrencyDefaults( currency );

		if ( ! price || parseFloat( price ) === 0 ) {
			this.setState( {
				fieldPriceError: __( 'If you’re selling something, you need a price tag. Add yours here.' ),
			} );
			return false;
		}

		if ( Number.isNaN( parseFloat( price ) ) ) {
			this.setState( {
				fieldPriceError: __( 'Invalid price' ),
			} );
			return false;
		}

		if ( parseFloat( price ) < 0 ) {
			this.setState( {
				fieldPriceError: __(
					'Your price is negative — enter a positive number so people can pay the right amount.'
				),
			} );
			return false;
		}

		if ( this.decimalPlaces( price ) > precision ) {
			if ( precision === 0 ) {
				this.setState( {
					fieldPriceError: __(
						'We know every penny counts, but prices can’t contain decimal values.'
					),
				} );
				return false;
			}

			this.setState( {
				fieldPriceError: sprintf(
					_n(
						'The price cannot have more than %d decimal place.',
						'The price cannot have more than %d decimal places.',
						precision
					),
					precision
				),
			} );
			return false;
		}

		if ( this.state.fieldPriceError ) {
			this.setState( { fieldPriceError: null } );
		}

		return true;
	};

	/**
	 * Validate email
	 *
	 * Stores error message in state.fieldEmailError
	 *
	 * @returns {Boolean} True when valid, false when invalid
	 */
	validateEmail = () => {
		const { email } = this.props.attributes;
		if ( ! email ) {
			this.setState( {
				fieldEmailError: __(
					'We want to make sure payments reach you, so please add an email address.'
				),
			} );
			return false;
		}

		if ( ! emailValidator.validate( email ) ) {
			this.setState( {
				fieldEmailError: sprintf( __( '%s is not a valid email address.' ), email ),
			} );
			return false;
		}

		if ( this.state.fieldEmailError ) {
			this.setState( { fieldEmailError: null } );
		}

		return true;
	};

	/**
	 * Validate title
	 *
	 * Stores error message in state.fieldTitleError
	 *
	 * @returns {Boolean} True when valid, false when invalid
	 */
	validateTitle = () => {
		const { title } = this.props.attributes;
		if ( ! title ) {
			this.setState( {
				fieldTitleError: __(
					'Please add a brief title so that people know what they’re paying for.'
				),
			} );
			return false;
		}

		if ( this.state.fieldTitleError ) {
			this.setState( { fieldTitleError: null } );
		}

		return true;
	};

	handleEmailChange = email => {
		this.props.setAttributes( { email } );
		this.setState( { fieldEmailError: null } );
	};

	handleContentChange = content => {
		this.props.setAttributes( { content } );
	};

	handlePriceChange = price => {
		price = parseFloat( price );
		if ( ! isNaN( price ) ) {
			this.props.setAttributes( { price } );
		} else {
			this.props.setAttributes( { price: undefined } );
		}
		this.setState( { fieldPriceError: null } );
	};

	handleCurrencyChange = currency => {
		this.props.setAttributes( { currency } );
	};

	handleMultipleChange = multiple => {
		this.props.setAttributes( { multiple: !! multiple } );
	};

	handleTitleChange = title => {
		this.props.setAttributes( { title } );
		this.setState( { fieldTitleError: null } );
	};

	formatPrice = ( price, currency, withSymbol = true ) => {
		const { precision, symbol } = getCurrencyDefaults( currency );
		const value = price.toFixed( precision );
		// Trim the dot at the end of symbol, e.g., 'kr.' becomes 'kr'
		return withSymbol ? `${ value } ${ trimEnd( symbol, '.' ) }` : value;
	};

	getCurrencyList = SUPPORTED_CURRENCY_LIST.map( value => {
		const { symbol } = getCurrencyDefaults( value );
		// if symbol is equal to the code (e.g., 'CHF' === 'CHF'), don't duplicate it.
		// trim the dot at the end, e.g., 'kr.' becomes 'kr'
		const label = symbol === value ? value : `${ value } ${ trimEnd( symbol, '.' ) }`;
		return { value, label };
	} );

	render() {
		const { fieldEmailError, fieldPriceError, fieldTitleError } = this.state;
		const { attributes, isSelected, isLoadingInitial, instanceId } = this.props;
		const { content, currency, email, multiple, price, title } = attributes;

		if ( ! isSelected && isLoadingInitial ) {
			return (
				<div className="simple-payments__loading">
					<ProductPlaceholder
						ariaBusy="true"
						content="█████"
						formattedPrice="█████"
						title="█████"
					/>
				</div>
			);
		}

		if (
			! isSelected &&
			email &&
			price &&
			title &&
			! fieldEmailError &&
			! fieldPriceError &&
			! fieldTitleError
		) {
			return (
				<ProductPlaceholder
					ariaBusy="false"
					content={ content }
					formattedPrice={ this.formatPrice( price, currency ) }
					multiple={ multiple }
					title={ title }
				/>
			);
		}

		return (
			<div className="wp-block-jetpack-simple-payments">
				<Fragment>
					<InspectorControls key="inspector">
						<PanelBody>
							<ExternalLink href="https://support.wordpress.com/simple-payments/">
								{ __( 'Support reference' ) }
							</ExternalLink>
						</PanelBody>
					</InspectorControls>

					<TextControl
						aria-describedby={ `${ instanceId }-title-error` }
						className={ classNames( 'simple-payments__field', 'simple-payments__field-title', {
							'simple-payments__field-has-error': fieldTitleError,
						} ) }
						disabled={ isLoadingInitial }
						label={ __( 'Item name' ) }
						onChange={ this.handleTitleChange }
						placeholder={ __( 'Item name' ) }
						required
						type="text"
						value={ title }
					/>
					<HelpMessage id={ `${ instanceId }-title-error` } isError>
						{ fieldTitleError }
					</HelpMessage>

					<TextareaControl
						className="simple-payments__field simple-payments__field-content"
						disabled={ isLoadingInitial }
						label={ __( 'Describe your item in a few words' ) }
						onChange={ this.handleContentChange }
						placeholder={ __( 'Describe your item in a few words' ) }
						value={ content }
					/>

					<div className="simple-payments__price-container">
						<SelectControl
							className="simple-payments__field simple-payments__field-currency"
							disabled={ isLoadingInitial }
							label={ __( 'Currency' ) }
							onChange={ this.handleCurrencyChange }
							options={ this.getCurrencyList }
							value={ currency }
						/>
						<TextControl
							aria-describedby={ `${ instanceId }-price-error` }
							disabled={ isLoadingInitial }
							className={ classNames( 'simple-payments__field', 'simple-payments__field-price', {
								'simple-payments__field-has-error': fieldPriceError,
							} ) }
							label={ __( 'Price' ) }
							onChange={ this.handlePriceChange }
							placeholder={ this.formatPrice( 0, currency, false ) }
							required
							step="1"
							type="number"
							value={ price || '' }
						/>
						<HelpMessage id={ `${ instanceId }-price-error` } isError>
							{ fieldPriceError }
						</HelpMessage>
					</div>

					<div className="simple-payments__field-multiple">
						<ToggleControl
							checked={ Boolean( multiple ) }
							disabled={ isLoadingInitial }
							label={ __( 'Allow people to buy more than one item at a time' ) }
							onChange={ this.handleMultipleChange }
						/>
					</div>

					<TextControl
						aria-describedby={ `${ instanceId }-email-${ fieldEmailError ? 'error' : 'help' }` }
						className={ classNames( 'simple-payments__field', 'simple-payments__field-email', {
							'simple-payments__field-has-error': fieldEmailError,
						} ) }
						disabled={ isLoadingInitial }
						label={ __( 'Email' ) }
						onChange={ this.handleEmailChange }
						placeholder={ __( 'Email' ) }
						required
						type="email"
						value={ email }
					/>
					<HelpMessage id={ `${ instanceId }-email-error` } isError>
						{ fieldEmailError }
					</HelpMessage>
					<HelpMessage id={ `${ instanceId }-email-help` }>
						{ __(
							'Enter the email address associated with your PayPal account. Don’t have an account?'
						) + ' ' }
						<ExternalLink href="https://www.paypal.com/">
							{ __( 'Create one on PayPal' ) }
						</ExternalLink>
					</HelpMessage>
				</Fragment>
			</div>
		);
	}
}

const mapSelectToProps = withSelect( ( select, props ) => {
	const { paymentId } = props.attributes;
	const { getEntityRecord } = select( 'core' );
	const { isResolving } = select( 'core/data' );

	if ( ! mapSelectToProps.fromApi ) {
		const simplePaymentApiSchema = {
			type: 'object',
			required: [ 'id', 'content', 'meta', 'title' ],
			additionalProperties: true,
			properties: {
				id: { type: 'integer', minimum: 0, exclusiveMinimum: true },
				content: { type: 'object' },
				meta: {
					type: 'object',
					required: [ 'spay_currency', 'spay_email', 'spay_multiple', 'spay_price' ],
					properties: {
						spay_currency: { type: 'string', enum: SUPPORTED_CURRENCY_LIST },
						spay_email: { type: 'string' },
						spay_multiple: { type: 'boolean' },
						spay_price: {
							type: 'number',
							minimum: 0,
							exclusiveMinimum: true,
						},
					},
				},
				title: { type: 'object' },
			},
		};

		const fromApiTransform = memoize( data => {
			return {
				id: data.id,
				content: data.content.raw,
				currency: data.meta.spay_currency,
				email: data.meta.spay_email,
				multiple: data.meta.spay_multiple,
				price: data.meta.spay_price,
				title: data.title.raw,
			};
		} );

		mapSelectToProps.fromApi = makeJsonSchemaParser( simplePaymentApiSchema, fromApiTransform );
	}

	let simplePayment = undefined;
	let isLoadingInitial = false;
	if ( paymentId ) {
		const args = [ 'postType', SIMPLE_PAYMENTS_PRODUCT_POST_TYPE, paymentId ];
		const record = getEntityRecord( ...args );
		isLoadingInitial = isResolving( 'core', 'getEntityRecord', args );
		debug( 'Record: %o', record );
		if ( ! isNull( record ) ) {
			try {
				simplePayment = mapSelectToProps.fromApi( record );
			} catch ( err ) {
				// 😱 Bad payment data! What to do?
			}
		}
	}

	return {
		isLoadingInitial,
		simplePayment,
	};
} );

export default compose(
	mapSelectToProps,
	withInstanceId
)( SimplePaymentsEdit );
