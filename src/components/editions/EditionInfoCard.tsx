/**
 * 版本信息卡片组件
 * 显示版本的所有元数据
 */

import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { Image, ChevronDown, ChevronUp } from 'lucide-react';
import {
  formatEditionNumber,
  formatDate,
  formatPrice,
  type EditionWithDetails,
} from './editionDetailUtils';

interface EditionInfoCardProps {
  edition: EditionWithDetails;
}

export const EditionInfoCard = memo(function EditionInfoCard({
  edition,
}: EditionInfoCardProps) {
  const { t, i18n } = useTranslation('editionDetail');
  const [locationExpanded, setLocationExpanded] = useState(false);

  const editionNumber = formatEditionNumber(edition, t);

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex flex-col min-[720px]:flex-row gap-6">
        {/* Thumbnail */}
        <div className="w-full min-[720px]:w-56 lg:w-64 h-64 min-[720px]:h-56 lg:h-64 bg-muted rounded-lg overflow-hidden flex-shrink-0">
          {edition.artwork?.thumbnail_url ? (
            <img
              src={edition.artwork.thumbnail_url}
              alt={edition.artwork.title_en}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Image className="w-12 h-12" />
            </div>
          )}
        </div>

        {/* Edition info */}
        <div className="flex-1">
          {/* Artwork title */}
          <Link
            to={`/artworks/${edition.artwork_id}`}
            className="text-primary hover:underline"
          >
            <h2 className="text-lg text-muted-foreground mb-1">
              {edition.artwork?.title_en}
              {edition.artwork?.title_cn && ` · ${edition.artwork.title_cn}`}
            </h2>
          </Link>

          {/* Edition number */}
          <h1 className="text-page-title mb-4">
            {editionNumber}
            {edition.inventory_number && (
              <span className="text-muted-foreground font-normal ml-2">
                #{edition.inventory_number}
              </span>
            )}
          </h1>

          {/* Status badge */}
          <div className="inline-flex items-center gap-2 mb-4">
            <StatusIndicator status={edition.status} showLabel size="lg" />
          </div>

          {/* Details */}
          <div className="space-y-2 text-sm">
            {/* Location */}
            {edition.location && (() => {
              const hasLocationDetails = Boolean(
                edition.location.address ||
                  edition.location.contact ||
                  edition.location.notes
              );
              return (
                <div>
                  <p
                    className={
                      hasLocationDetails
                        ? 'cursor-pointer inline-flex items-center gap-1'
                        : ''
                    }
                    onClick={() =>
                      hasLocationDetails && setLocationExpanded(!locationExpanded)
                    }
                  >
                    <span className="text-muted-foreground">
                      {t('info.location')}
                    </span>
                    <span
                      className={
                        hasLocationDetails
                          ? 'underline decoration-dotted underline-offset-2'
                          : ''
                      }
                    >
                      {edition.location.name}
                    </span>
                    {hasLocationDetails &&
                      (locationExpanded ? (
                        <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ))}
                  </p>
                  {locationExpanded && hasLocationDetails && (
                    <div className="mt-2 ml-4 p-2 bg-muted/50 rounded text-xs space-y-1">
                      {edition.location.address && (
                        <p>
                          <span className="text-muted-foreground">
                            {t('info.locationAddress')}
                          </span>
                          {edition.location.address}
                        </p>
                      )}
                      {edition.location.contact && (
                        <p>
                          <span className="text-muted-foreground">
                            {t('info.locationContact')}
                          </span>
                          {edition.location.contact}
                        </p>
                      )}
                      {edition.location.notes && (
                        <p>
                          <span className="text-muted-foreground">
                            {t('info.locationNotes')}
                          </span>
                          {edition.location.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Price info */}
            {edition.sale_price && (
              <p>
                <span className="text-muted-foreground">
                  {edition.status === 'sold'
                    ? t('info.soldPrice')
                    : t('info.listPrice')}
                </span>
                {formatPrice(edition.sale_price, edition.sale_currency)}
              </p>
            )}

            {/* Sale details (sold status only) */}
            {edition.status === 'sold' && (
              <>
                {edition.sale_date && (
                  <p>
                    <span className="text-muted-foreground">
                      {t('info.saleDate')}
                    </span>
                    {formatDate(edition.sale_date, i18n.language)}
                  </p>
                )}
                {edition.buyer_name && (
                  <p>
                    <span className="text-muted-foreground">
                      {t('info.buyer')}
                    </span>
                    {edition.buyer_name}
                  </p>
                )}
              </>
            )}

            {/* Loan info (at_gallery status only) */}
            {edition.status === 'at_gallery' && (
              <>
                {edition.consignment_start && (
                  <p>
                    <span className="text-muted-foreground">
                      {t('info.loanStart')}
                    </span>
                    {formatDate(edition.consignment_start, i18n.language)}
                  </p>
                )}
                {edition.consignment_end && (
                  <p>
                    <span className="text-muted-foreground">
                      {t('info.loanExpectedReturn')}
                    </span>
                    {formatDate(edition.consignment_end, i18n.language)}
                  </p>
                )}
              </>
            )}

            {/* Exhibition info (at_museum status only) */}
            {edition.status === 'at_museum' && (
              <>
                {edition.loan_start && (
                  <p>
                    <span className="text-muted-foreground">
                      {t('info.exhibitionStart')}
                    </span>
                    {formatDate(edition.loan_start, i18n.language)}
                  </p>
                )}
                {edition.loan_end && (
                  <p>
                    <span className="text-muted-foreground">
                      {t('info.exhibitionEnd')}
                    </span>
                    {formatDate(edition.loan_end, i18n.language)}
                  </p>
                )}
              </>
            )}

            {/* Certificate number */}
            {edition.certificate_number && (
              <p>
                <span className="text-muted-foreground">
                  {t('info.certificate')}
                </span>
                #{edition.certificate_number}
              </p>
            )}

            {/* Storage detail */}
            {edition.storage_detail && (
              <p>
                <span className="text-muted-foreground">
                  {t('info.storageDetail')}
                </span>
                {edition.storage_detail}
              </p>
            )}

            {/* Condition (only show if not excellent) */}
            {edition.condition && edition.condition !== 'excellent' && (
              <p>
                <span className="text-muted-foreground">
                  {t('info.condition')}
                </span>
                {t(`info.conditionValues.${edition.condition}`)}
              </p>
            )}

            {/* Condition notes */}
            {edition.condition_notes && (
              <p>
                <span className="text-muted-foreground">
                  {t('info.conditionNotes')}
                </span>
                {edition.condition_notes}
              </p>
            )}
          </div>

          {/* Notes */}
          {edition.notes && (
            <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
              <p className="text-muted-foreground mb-1">{t('info.notes')}</p>
              <p>{edition.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
